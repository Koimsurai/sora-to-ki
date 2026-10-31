// 收藏頁天空的背景（光霧、銀河、遠方的星、閃爍的星）交給 GPU 畫：WebGL2，在 2D 那張畫布底下另一張畫布上。
//
// 2D 的畫法是 JS 一顆一顆投影、一顆一個 fillRect，一幀上萬顆，主執行緒最貴的就是這段
// （media/signalSky 的 draw）。這裡每幀只傳鏡頭與時間，投影在頂點著色器裡做，一次畫完。
//
// 畫出來要跟 2D 的一樣，幾個地方照 Skia 的做法：
//   - 點是軸對齊的方塊：反鋸齒照 Skia（四條邊各自的距離取最小、比 1 像素細的撐開再乘回寬度，見 RECT_FS）
//   - 半透明照 2D 的順序一顆疊一顆（ONE、ONE_MINUS_SRC_ALPHA，預乘），資料在 signalSky 那邊照 draw 的順序排好
//   - 出畫面的點不畫：2D 的條件是左上角在畫面外就跳過（部分露在畫面裡的也不畫），這裡一樣
//   - 光霧是同一張柔光圖，雙線性取樣、預乘
// 沒有 WebGL2、或只有軟體渲染（failIfMajorPerformanceCaveat）就不建，呼叫端照舊用 2D 畫背景。
import { channels, onPalette, palette } from '@/lib/palette';
import type { GpuBackdropData, SkyView } from './signalSky';

let ink = channels(palette().paper);
onPalette((p) => {
  ink = channels(p.paper);
});

/** 無限遠的方向投影到畫面（跟 signalSky 的 skyAt 同一個式子）；在鏡頭背後或太偏的回 false */
const PROJECT = /* glsl */ `
uniform vec2 u_e;      // 地球在畫面上的位置（ex、ey，CSS 像素）
uniform float u_F;     // 透視的焦距：畫面對角線 × 0.36
uniform vec4 u_rot;    // cosP、sinP、sinE、cosE
bool skyAt(vec3 d, out vec2 p) {
  float depth = (d.x * u_rot.y + d.y * u_rot.x) * u_rot.w + d.z * u_rot.z;
  float into = -depth;
  if (into < 0.08) return false;
  float x = d.x * u_rot.x - d.y * u_rot.y;
  float y = d.x * u_rot.y + d.y * u_rot.x;
  p = vec2(u_e.x + (u_F * x) / into, u_e.y + (u_F * (y * u_rot.z - d.z * u_rot.w)) / into);
  return true;
}
uniform vec2 u_wh;     // 畫面大小（CSS 像素）
uniform float u_dpr;   // 2D 那邊 setTransform 的倍率
uniform vec2 u_res;    // 畫布的像素大小
vec4 toClip(vec2 dev) {
  return vec4(dev.x / u_res.x * 2.0 - 1.0, 1.0 - dev.y / u_res.y * 2.0, 0.0, 1.0);
}
const vec4 OFF = vec4(2.0, 2.0, 2.0, 1.0);
`;

const RECT_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_dir;
layout(location = 2) in float a_size;
layout(location = 3) in float a_alpha;
layout(location = 4) in vec2 a_twinkle;
layout(location = 5) in float a_cull;
uniform float u_t;
${PROJECT}
out vec4 v_rect;   // 方塊的左上與右下（裝置像素）
out float v_alpha;
void main() {
  vec2 p;
  if (!skyAt(a_dir, p) || (a_cull > 0.5 && (p.x < 0.0 || p.x > u_wh.x || p.y < 0.0 || p.y > u_wh.y))) {
    gl_Position = OFF;
    return;
  }
  vec2 r0 = p * u_dpr;
  vec2 r1 = (p + a_size) * u_dpr;
  // 四邊各外擴一個像素，反鋸齒的那一圈才畫得到
  vec2 dev = mix(floor(r0) - 1.0, ceil(r1) + 1.0, a_corner);
  gl_Position = toClip(dev);
  v_rect = vec4(r0, r1);
  v_alpha = a_twinkle.x > 0.0 ? 0.5 + 0.4 * sin(u_t * a_twinkle.x + a_twinkle.y) : a_alpha;
}
`;

const RECT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec4 v_rect;
in float v_alpha;
uniform vec3 u_ink;
uniform vec2 u_res;
out vec4 color;
void main() {
  // 這個像素中心在裝置像素座標（左上原點）的位置
  vec2 c = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 lo = v_rect.xy;
  vec2 hi = v_rect.zw;
  // 照 Skia 的做法（實測 2D canvas 讀回來比對過）：
  //   - 比 1 像素細的那一邊，以中心撐到 1 像素，最後再乘上原本的寬度
  //   - 每條邊各自算「像素中心到邊的距離 + 0.5」當覆蓋率，取四條邊裡最小的（不是兩個方向相乘：
  //     相乘的話方塊的角落會偏暗，星一多整片就顯得暗、顆粒）
  vec2 len = hi - lo;
  vec2 thin = vec2(lessThan(len, vec2(1.0)));
  vec2 m = (lo + hi) * 0.5;
  lo = mix(lo, m - 0.5, thin);
  hi = mix(hi, m + 0.5, thin);
  vec2 scale = mix(vec2(1.0), len, thin);
  vec2 edge = clamp(min(c - lo, hi - c) + 0.5, 0.0, 1.0);
  float cov = min(edge.x, edge.y) * scale.x * scale.y;
  float a = v_alpha * cov;
  color = vec4(u_ink * a, a);
}
`;

// 歐特雲與小行星帶：有距離的點（signalSky 的 project），一個像素大。透明度的規則照 draw：
// 歐特雲照自己離地球多遠淡入淡出（太近、太遠都不畫），小行星帶照整條帶的亮度
const POINT_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_pos;
layout(location = 2) in float a_alpha;
layout(location = 3) in float a_dist;
layout(location = 4) in float a_group;
uniform float u_k;      // 一光秒幾個像素
uniform vec3 u_sun;     // 太陽在哪（小行星帶的點是相對它的）
uniform vec2 u_belts;   // 小行星帶、柯伊伯帶各多亮
uniform float u_diag;
${PROJECT}
out vec4 v_rect;
out float v_alpha;
float fade(float r) {
  return clamp((r - 4.0) / 14.0, 0.0, 1.0) * clamp((u_diag * 1.4 - r) / (u_diag * 0.5), 0.0, 1.0);
}
void main() {
  vec3 P = a_pos;
  float a;
  if (a_group < 0.5) {
    float r = u_k * a_dist;
    a = a_alpha * fade(r);
    if (r < 3.0 || r > u_diag * 1.2 || a < 0.01) {
      gl_Position = OFF;
      return;
    }
  } else {
    float g = a_group < 1.5 ? u_belts.x : u_belts.y;
    if (g <= 0.01) {
      gl_Position = OFF;
      return;
    }
    a = a_alpha * g;
    P = vec3(a_pos.xy + u_sun.xy, a_pos.z);
  }
  float x = P.x * u_rot.x - P.y * u_rot.y;
  float y = P.x * u_rot.y + P.y * u_rot.x;
  vec2 p = vec2(u_e.x + u_k * x, u_e.y + u_k * (y * u_rot.z - P.z * u_rot.w));
  vec2 r0 = p * u_dpr;
  vec2 r1 = (p + 1.0) * u_dpr;
  gl_Position = toClip(mix(floor(r0) - 1.0, ceil(r1) + 1.0, a_corner));
  v_rect = vec4(r0, r1);
  v_alpha = a;
}
`;

const HAZE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_dir;
layout(location = 2) in float a_size;
layout(location = 3) in float a_weight;
uniform float u_blob;  // 畫面對角線 × 0.055
${PROJECT}
out vec2 v_uv;
out float v_alpha;
void main() {
  vec2 p;
  if (!skyAt(a_dir, p)) {
    gl_Position = OFF;
    return;
  }
  float r = u_blob * a_size;
  gl_Position = toClip((p - r + a_corner * 2.0 * r) * u_dpr);
  v_uv = a_corner;
  v_alpha = 0.03 * a_weight;
}
`;

const HAZE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_sprite;
out vec4 color;
void main() {
  color = texture(u_sprite, v_uv) * v_alpha;
}
`;

/** 這一幀歐特雲與小行星帶要的（signalSky 的 gpuScene） */
interface GpuScene {
  sun: { x: number; y: number; z: number };
  belts: readonly [number, number];
}

export interface GpuBackdrop {
  /** 還能畫：context 沒掉、程式也編好了 */
  readonly ok: boolean;
  /** context 還在（程式可能還在編） */
  readonly alive: boolean;
  render(v: SkyView, frame: { w: number; h: number; t: number }, dpr: number, scene: GpuScene): void;
  dispose(): void;
}

function createGpuBackdrop(canvas: HTMLCanvasElement, data: GpuBackdropData): GpuBackdrop | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  canvas.addEventListener('webglcontextlost', onLost);

  // 編譯交給驅動在背景做（KHR_parallel_shader_compile）：送出去就好，不問結果。一問（COMPILE_STATUS、
  // LINK_STATUS、getUniformLocation）主執行緒就得停下來等它編完，CPU 降速 4 倍時是 44ms，
  // 正好卡在換頁轉場的點還在飛的時候（docs/transitions/01-baseline）。編好之前 ok 是 false，背景照舊由 2D 畫。
  // 沒有這個擴充的瀏覽器第一次問 ok 時當場編完，跟原本一樣
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  const start = (vs: string, fs: string) => {
    const prog = gl.createProgram();
    const shaders: WebGLShader[] = [];
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
      shaders.push(sh);
    }
    gl.linkProgram(prog);
    return { prog, shaders };
  };
  const rectStart = start(RECT_VS, RECT_FS);
  const hazeStart = start(HAZE_VS, HAZE_FS);
  const pointStart = start(POINT_VS, RECT_FS);
  if (!rectStart || !hazeStart || !pointStart) return null;
  const all = [rectStart, hazeStart, pointStart];
  const rectProg = rectStart.prog;
  const hazeProg = hazeStart.prog;
  const pointProg = pointStart.prog;

  // 四個角（triangle strip），兩支程式共用
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

  /** 每個實例的欄位：[location, 幾個數] */
  const instanced = (prog: WebGLProgram, values: Float32Array, layout: [number, number][]) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    const stride = layout.reduce((n, [, size]) => n + size, 0);
    let offset = 0;
    for (const [loc, size] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
      offset += size;
    }
    gl.bindVertexArray(null);
    return { vao, buf, count: values.length / stride, prog };
  };
  const rects = instanced(rectProg, data.rects, [
    [1, 3],
    [2, 1],
    [3, 1],
    [4, 2],
    [5, 1],
  ]);
  const haze = instanced(hazeProg, data.haze, [
    [1, 3],
    [2, 1],
    [3, 1],
  ]);
  const points = instanced(pointProg, data.points, [
    [1, 3],
    [2, 1],
    [3, 1],
    [4, 1],
  ]);

  // 光霧的柔光圖：預乘上傳（Skia 裡存的也是預乘），雙線性
  const sprite = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sprite);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.sprite());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  type Uniforms = Record<string, WebGLUniformLocation | null>;
  /** 編好、連結好之後才拿得到 uniform 的位置。null 是還在編，false 是編壞了（從此交給 2D） */
  let linked: { ru: Uniforms; hu: Uniforms; pu: Uniforms } | false | null = null;
  const ready = () => {
    if (linked !== null) return linked !== false;
    if (parallel && !all.every((p) => gl.getProgramParameter(p.prog, parallel.COMPLETION_STATUS_KHR) === true))
      return false;
    for (const { prog, shaders } of all) {
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) continue;
      for (const sh of shaders)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn('[gpuBackdrop]', gl.getShaderInfoLog(sh));
      console.warn('[gpuBackdrop]', gl.getProgramInfoLog(prog));
      linked = false;
      return false;
    }
    const uniforms = (prog: WebGLProgram, names: string[]) =>
      Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
    const common = ['u_e', 'u_F', 'u_rot', 'u_wh', 'u_dpr', 'u_res'];
    linked = {
      ru: uniforms(rectProg, [...common, 'u_t', 'u_ink']),
      hu: uniforms(hazeProg, [...common, 'u_blob', 'u_sprite']),
      pu: uniforms(pointProg, [...common, 'u_ink', 'u_k', 'u_sun', 'u_belts', 'u_diag']),
    };
    return true;
  };

  return {
    get ok() {
      return !lost && !gl.isContextLost() && ready();
    },
    get alive() {
      return !lost && !gl.isContextLost();
    },
    render(v, { w, h, t }, dpr, scene) {
      if (lost || !linked) return;
      const { ru, hu, pu } = linked;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const set = (u: Record<string, WebGLUniformLocation | null>) => {
        gl.uniform2f(u.u_e, v.ex, v.ey);
        gl.uniform1f(u.u_F, v.diag * 0.36);
        gl.uniform4f(u.u_rot, v.cosP, v.sinP, v.sinE, v.cosE);
        gl.uniform2f(u.u_wh, w, h);
        gl.uniform1f(u.u_dpr, dpr);
        gl.uniform2f(u.u_res, canvas.width, canvas.height);
      };
      // 順序跟 2D 一樣：先鋪光霧，點再疊上去
      gl.useProgram(hazeProg);
      set(hu);
      gl.uniform1f(hu.u_blob, v.diag * 0.055);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sprite);
      gl.uniform1i(hu.u_sprite, 0);
      gl.bindVertexArray(haze.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, haze.count);
      gl.useProgram(rectProg);
      set(ru);
      gl.uniform1f(ru.u_t, t);
      gl.uniform3f(ru.u_ink, ink[0] / 255, ink[1] / 255, ink[2] / 255);
      gl.bindVertexArray(rects.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rects.count);
      // 歐特雲、小行星帶、柯伊伯帶（2D 裡畫在刻度圈之後；這裡在它們底下，只有點正好壓在虛線上的那幾個像素不同）
      gl.useProgram(pointProg);
      set(pu);
      gl.uniform3f(pu.u_ink, ink[0] / 255, ink[1] / 255, ink[2] / 255);
      gl.uniform1f(pu.u_k, v.k);
      gl.uniform3f(pu.u_sun, scene.sun.x, scene.sun.y, scene.sun.z);
      gl.uniform2f(pu.u_belts, scene.belts[0], scene.belts[1]);
      gl.uniform1f(pu.u_diag, v.diag);
      gl.bindVertexArray(points.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, points.count);
      gl.bindVertexArray(null);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(corners);
      gl.deleteBuffer(rects.buf);
      gl.deleteBuffer(haze.buf);
      gl.deleteBuffer(points.buf);
      gl.deleteVertexArray(rects.vao);
      gl.deleteVertexArray(haze.vao);
      gl.deleteVertexArray(points.vao);
      gl.deleteTexture(sprite);
      gl.deleteProgram(rectProg);
      gl.deleteProgram(hazeProg);
      gl.deleteProgram(pointProg);
    },
  };
}

/*
 * 這張畫布與它的 WebGL context 先建好、一直留著：
 *   - 建 context（同步等 GPU 那邊）與送出編譯，CPU 降速 4 倍時合計 50–100ms。收藏頁掛上去那一刻做的話，
 *     正好卡在換頁轉場的點還在飛的時候（docs/transitions/01-baseline）。改在預載的空檔做（signalSky 的
 *     prewarmSignalSky：滑過連結、換頁開始收的時候），等收藏頁掛上去，編譯早在 GPU 那邊做完了
 *   - 離開收藏頁時不丟掉，下次進來直接接手。只有 context 掉了才重建
 * 收藏頁照舊渲染自己的那張 <canvas>，掛上去時換成這一張（同一個位置、同樣的屬性，版面不變）
 */
let kept: { canvas: HTMLCanvasElement; backdrop: GpuBackdrop } | 'none' | null = null;

/** 網址帶 ?gpusky=0 就不用 GPU（A/B 比較用） */
export const gpuSkyWanted = () => new URLSearchParams(window.location.search).get('gpusky') !== '0';

/** 先把畫布、context 與程式建好。建不起來（沒有 WebGL2、只有軟體渲染）就記住，之後不再試 */
export function prepareGpuBackdrop(data: () => GpuBackdropData) {
  if (kept === 'none' || kept?.backdrop.alive) return;
  kept?.backdrop.dispose();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const backdrop = createGpuBackdrop(canvas, data());
  kept = backdrop ? { canvas, backdrop } : 'none';
}

/** 收藏頁掛上去時：用先建好的那張換掉自己那張（還沒建就當場建）。null 是不用 GPU，背景由 2D 畫 */
export function adoptGpuBackdrop(
  placeholder: HTMLCanvasElement,
  data: () => GpuBackdropData,
): { canvas: HTMLCanvasElement; backdrop: GpuBackdrop } | null {
  if (!gpuSkyWanted()) return null;
  prepareGpuBackdrop(data);
  if (!kept || kept === 'none') return null;
  placeholder.replaceWith(kept.canvas);
  return kept;
}

/**
 * 收藏頁卸下（或天空換了要重掛）時：原本那張換回去、這張拿下來留著下次用；context 掉了就丟掉。
 * 換回去是為了重掛：effect 再跑一次時還要從原本那張的位置換上來
 */
export function releaseGpuBackdrop(placeholder: HTMLCanvasElement) {
  if (!kept || kept === 'none') return;
  if (kept.canvas.parentNode) kept.canvas.replaceWith(placeholder);
  if (!kept.backdrop.alive) {
    kept.backdrop.dispose();
    kept = null;
  }
}
