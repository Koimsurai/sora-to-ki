// 開場（超空間跳躍）的 GPU 那一半：星芒、殘影、底色、閃光，以及跟星空／土星的合成。
//
// 跟星空、土星共用 lib/starfieldGpu.ts 的 renderer 與 canvas——同一個 GPU context、同一條
// 渲染迴圈，所以開場進行中不會有任何初始化，也沒有「開場層 → 3D 層」的 DOM 圖層交接。
//
// 分三層，由下而上（每一層都照 CSS／2D canvas 的語意算，畫面跟以前的 DOM 版一致）：
//   1. 底色：radial-gradient(ellipse at center, #050620 0%, #000 70%)
//   2. 星芒：畫在一張常駐的 render target 上，每幀先蓋一層半透明底色再畫新的線段，
//      舊的線段就這樣慢慢淡成殘影（2D canvas 每幀 fillRect 的做法）。
//      整層再套淡入與往前推進的縮放。
//   3. 閃光：圓形徑向漸層，放大＋淡出
// 三層合起來乘上開場層的不透明度（結尾淡出），星空與土星爆炸後疊在最上面。
//
// 顏色全部在 sRGB 裡算、混色（跟瀏覽器的 2D canvas 與 CSS 一樣），最後才轉成線性空間交給
// RenderPipeline 的輸出轉換——不然漸層的中間色會跟以前不一樣。
import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  float,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  mod,
  positionGeometry,
  screenUV,
  sRGBTransferEOTF,
  step,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { createHyperspaceStars, MAX_STREAKS, STREAK_CORE } from './hyperspaceStars';
import { trailFadeFor, type IntroFrameState } from './introTimeline';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** CSS 的 hsl() → sRGB（CSS Color 4 的公式）。h 是角度，s、l 是 0–1 */
function hsl(h: F, s: F, l: F): V3 {
  const k = mod(vec3(0, 8, 4).add(h.div(30)), 12);
  const a = s.mul(min(l, float(1).sub(l)));
  return l.sub(a.mul(max(-1, min(min(k.sub(3), float(9).sub(k)), 1))));
}

/** s 落在 [s0, s1] 的段內進度。串起來用：c = mix(c, 下一站, seg(...)) 一段一段推 */
const seg = (s: F, s0: number, s1: number): F => clamp(s.sub(s0).div(s1 - s0), 0, 1);

const rgb255 = (r: number, g: number, b: number) => vec3(r / 255, g / 255, b / 255);

export interface Hyperspace {
  /** 這一幀：推進模擬、把星芒畫進殘影 target、更新合成用的 uniform */
  update(frame: IntroFrameState, elapsed: number, dtMs: number): void;
  /**
   * 合成：把開場層墊在 scene（星空＋土星，線性、premultiplied）底下。
   * 傳 null＝只有開場層：爆炸前 scene 整個被蓋住，連畫都不用畫（場景 pass＋bloom 省下來）。
   */
  composite(sceneOut: V4 | null): V4;
  setSize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

export function createHyperspace(
  renderer: THREE.WebGPURenderer,
  width: number,
  height: number,
  dpr: number,
): Hyperspace {
  let cssW = width;
  let cssH = height;
  const stars = createHyperspaceStars(width, height);

  // ── 殘影 target ──
  // 8-bit，跟 2D canvas 一樣；顏色存的是 sRGB 值（不做色彩空間轉換，當資料看）
  const target = new THREE.RenderTarget(Math.round(width * dpr), Math.round(height * dpr), {
    depthBuffer: false,
    type: THREE.UnsignedByteType,
  });
  // y 朝下、單位是 CSS px，跟以前的 2D canvas 座標一致
  const camera = new THREE.OrthographicCamera(0, width, 0, height, -1, 1);
  const trailScene = new THREE.Scene();

  // premultiplied 的 source-over（2D canvas 的預設混色）
  const sourceOver = (m: THREE.Material) => {
    m.transparent = true;
    m.depthTest = false;
    m.depthWrite = false;
    m.side = THREE.DoubleSide; // y 軸翻轉後正反面也跟著翻了
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  };

  // 每幀先蓋一層半透明底色（rgba(2, 3, 12, a)），舊的線段就淡成殘影
  const fadeAlpha = uniform(0);
  const fadeMat = new THREE.MeshBasicNodeMaterial();
  fadeMat.vertexNode = vec4(positionGeometry.xy, 0, 1);
  fadeMat.fragmentNode = vec4(rgb255(2, 3, 12).mul(fadeAlpha), fadeAlpha);
  sourceOver(fadeMat);
  const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat);
  fadeQuad.frustumCulled = false;
  fadeQuad.renderOrder = 0;
  trailScene.add(fadeQuad);

  // ── 星芒：一個 draw call，每條線段一個 instance ──
  const attrA = new THREE.InstancedBufferAttribute(stars.buffers.a, 4).setUsage(THREE.DynamicDrawUsage);
  const attrB = new THREE.InstancedBufferAttribute(stars.buffers.b, 4).setUsage(THREE.DynamicDrawUsage);
  const attrC = new THREE.InstancedBufferAttribute(stars.buffers.c, 4).setUsage(THREE.DynamicDrawUsage);
  const A = instancedBufferAttribute<'vec4'>(attrA, 'vec4');
  const B = instancedBufferAttribute<'vec4'>(attrB, 'vec4');
  const C = instancedBufferAttribute<'vec4'>(attrC, 'vec4');
  const dprU = uniform(dpr);

  // 頂點：單位 quad 拉成「尾端 → 頭端」的長條。平頭線、頭端多出半個線寬（補回以前圓頭凸出的長度），
  // 四周再各留 1 個裝置像素給反鋸齒。
  const len = B.x;
  const lineW = B.y;
  const pad = float(1).div(dprU);
  const along = len.add(lineW.mul(0.5)).add(pad);
  const across = lineW.add(pad.mul(2));
  const dir = A.zw;
  const g = positionGeometry.xy; // PlaneGeometry(1, 1)：-0.5..0.5
  const u = g.x.add(0.5).mul(along); // 沿線段，離尾端多遠（CSS px）
  const v = g.y.mul(across); // 離中線多遠
  const streakMat = new THREE.MeshBasicNodeMaterial();
  streakMat.positionNode = vec3(A.xy.add(dir.mul(u)).add(vec2(dir.y.negate(), dir.x).mul(v)), 0);

  // 片段：漸層 × 覆蓋率
  const uV = varying(u).mul(dprU);
  const vV = abs(varying(v)).mul(dprU);
  const lenV = varying(len).mul(dprU);
  const wV = varying(lineW).mul(dprU);
  const intensity = varying(B.z);
  const hue = varying(B.w);
  const sat = varying(C.x).div(100);
  const kind = varying(C.y);
  const s = clamp(uV.div(lenV), 0, 1);
  const coverage = clamp(wV.mul(0.5).add(0.5).sub(vV), 0, 1).mul(clamp(lenV.add(wV.mul(0.5)).sub(uV).add(0.5), 0, 1));

  // 光暈：同色相，亮度 70% → 72%
  const glowRgb = mix(hsl(hue, sat, float(0.7)), hsl(hue, sat, float(0.72)), seg(s, 0, 0.7));
  let glowA: F = mix(float(0), float(0.08), seg(s, 0, 0.7));
  glowA = mix(glowA, float(0.32), seg(s, 0.7, 0.96));
  glowA = mix(glowA, float(0.22), seg(s, 0.96, 1));
  // 亮核：頭端偏白、色相再往紫偏一點
  const coreSat = max(sat.sub(0.15), 0.2);
  let coreRgb: V3 = hsl(hue.add(8), coreSat, float(0.92));
  coreRgb = mix(coreRgb, hsl(hue.add(8), coreSat, float(0.95)), seg(s, 0.55, 0.85));
  coreRgb = mix(coreRgb, hsl(hue.add(12), max(coreSat.sub(0.1), 0.15), float(0.98)), seg(s, 0.85, 0.97));
  coreRgb = mix(coreRgb, hsl(hue.add(12), max(coreSat.sub(0.15), 0.15), float(0.99)), seg(s, 0.97, 1));
  let coreA: F = mix(float(0), float(0.1), seg(s, 0, 0.55));
  coreA = mix(coreA, float(0.45), seg(s, 0.55, 0.85));
  coreA = mix(coreA, float(1), seg(s, 0.85, 0.97));
  coreA = mix(coreA, float(0.85), seg(s, 0.97, 1));

  const isCore = step(STREAK_CORE - 0.5, kind);
  const rgb = mix(glowRgb, coreRgb, isCore);
  const alpha = mix(glowA, coreA, isCore).mul(intensity).mul(coverage);
  streakMat.fragmentNode = vec4(rgb.mul(alpha), alpha);
  sourceOver(streakMat);
  const streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), streakMat, MAX_STREAKS);
  streaks.frustumCulled = false;
  streaks.renderOrder = 1;
  streaks.count = 0;
  trailScene.add(streaks);

  // ── 合成用的 uniform ──
  const viewport = uniform(new THREE.Vector2(width, height));
  const entryOpacity = uniform(0);
  const entryScale = uniform(1);
  const flashOpacity = uniform(0);
  const flashScale = uniform(1);
  const stageOpacity = uniform(1);
  const sceneOpacity = uniform(0);
  const streaksOn = uniform(1);

  let cleared = false;
  const clearTarget = () => {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setRenderTarget(null);
  };
  clearTarget();

  return {
    update(frame, elapsed, dtMs) {
      entryOpacity.value = frame.entryOpacity;
      entryScale.value = frame.entryScale;
      flashOpacity.value = frame.flashOpacity;
      flashScale.value = frame.flashScale;
      stageOpacity.value = frame.stageOpacity;
      sceneOpacity.value = frame.sceneOpacity;
      streaksOn.value = frame.streaks ? 1 : 0;
      if (!frame.streaks) {
        // 爆炸時清空（以前是 clearRect），之後不再畫
        if (!cleared) {
          clearTarget();
          cleared = true;
        }
        return;
      }
      // 時間沒前進（除錯用的 ?intro-at 停住時）就不再往殘影上疊：同樣的線段每幀重畫會一路疊到不透明
      if (dtMs <= 0 && elapsed > 0) return;
      stars.step(elapsed, dtMs, frame.speedMult, cssW, cssH);
      const n = stars.buffers.count;
      for (const attr of [attrA, attrB, attrC]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, n * 4);
        attr.needsUpdate = true;
      }
      streaks.count = n;
      fadeAlpha.value = trailFadeFor(frame.trailFade60, dtMs);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.render(trailScene, camera);
      renderer.setRenderTarget(null);
      renderer.autoClear = autoClear;
    },

    composite(sceneOut) {
      const p = screenUV.mul(viewport);
      const center = viewport.mul(0.5);
      // 底色：radial-gradient(ellipse at center, #050620 0%, #000 70%)。
      // ellipse 預設 farthest-corner：長寬比跟視窗相同、通過角落 → 半徑是半寬／半高 × √2
      const q = length(p.sub(center).div(center.mul(Math.SQRT2)));
      const bg = mix(rgb255(5, 6, 32), vec3(0), clamp(q.div(0.7), 0, 1));

      // 星芒層：以畫面中心縮放（CSS transform: scale），縮小時邊緣露出底色
      const tuv = screenUV.sub(0.5).div(entryScale).add(0.5);
      const inside = step(0, tuv.x).mul(step(tuv.x, 1)).mul(step(0, tuv.y)).mul(step(tuv.y, 1));
      const trail = texture(target.texture, tuv).mul(inside).mul(entryOpacity).mul(streaksOn);

      // 閃光：radial-gradient(circle at center, …)，farthest-corner 的半徑是半對角線。
      // CSS 漸層在 premultiplied 空間內插，所以這裡一律用 premultiplied 的色標串
      const fd = length(p.sub(center)).div(length(center).mul(flashScale));
      let flash: V4 = vec4(1, 1, 1, 1);
      flash = mix(flash, vec4(rgb255(232, 238, 255).mul(0.9), 0.9), seg(fd, 0, 0.14));
      flash = mix(flash, vec4(rgb255(190, 215, 255).mul(0.5), 0.5), seg(fd, 0.14, 0.32));
      flash = mix(flash, vec4(rgb255(130, 165, 230).mul(0.2), 0.2), seg(fd, 0.32, 0.55));
      flash = mix(flash, vec4(0, 0, 0, 0), seg(fd, 0.55, 0.78));
      flash = flash.mul(flashOpacity);

      // 由下而上疊：底色（不透明）→ 星芒 → 閃光，整組乘上開場層的不透明度
      const stage = flash.rgb.add(trail.rgb.add(bg.mul(float(1).sub(trail.a))).mul(float(1).sub(flash.a)));
      // sRGB → 線性（整層不透明，所以不必先除回 alpha）
      const stageLinear = (sRGBTransferEOTF(stage) as V3).mul(stageOpacity);
      if (!sceneOut) return vec4(stageLinear, stageOpacity);

      const sceneA = sceneOut.a.mul(sceneOpacity);
      const keep = float(1).sub(sceneA);
      return vec4(sceneOut.rgb.mul(sceneOpacity).add(stageLinear.mul(keep)), sceneA.add(stageOpacity.mul(keep)));
    },

    setSize(w, h, d) {
      cssW = w;
      cssH = h;
      dprU.value = d;
      viewport.value.set(w, h);
      camera.right = w;
      camera.bottom = h;
      camera.updateProjectionMatrix();
      target.setSize(Math.round(w * d), Math.round(h * d));
    },

    dispose() {
      target.dispose();
      fadeQuad.geometry.dispose();
      fadeMat.dispose();
      streaks.geometry.dispose();
      streakMat.dispose();
      streaks.dispose();
    },
  };
}
