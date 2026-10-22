// 每個分區的天空（星軌、像素抖動），疊在星空 runner 的最後一道輸出上。
//
// 換頁時不是換一張背景，而是同一片星星在變：
//   星軌（手記）：整片星空繞著天極轉，每幀把星星疊進一張常駐的 render target，舊的慢慢變暗
//                 ——就是長曝光。軌跡會從零開始累積，所以「切進來的那幾秒」本身就是轉場。
//   像素抖動（碎念）：最後的畫面按格子取樣、用 4×4 Bayer 矩陣二值化，格子從 1 px 一格一格長到 4 px。
//
// 兩個效果都只動最後的輸出節點，場景本身（星星、土星）不變，所以跟土星的碎裂可以同時進行。
import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  floor,
  instancedBufferAttribute,
  max,
  mix,
  mod,
  positionGeometry,
  screenSize,
  screenUV,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { SkyMode } from './starfieldGpu';

type V4 = Node<'vec4'>;
type TexNode = ReturnType<typeof texture>;

export interface SkyFx {
  /** 把天空效果套到最後的輸出上 */
  output(sceneOut: V4): V4;
  setMode(mode: SkyMode): void;
  /** 換頁飛行時畫面往中心拉成光線的強度，0–1 */
  setWarp(amount: number): void;
  /**
   * 推進一幀。回傳：
   *   busy：還在轉場（要跟著 60fps 畫）
   *   frameMs：這一頁要求的固定幀間隔（像素抖動是 12fps 一格一格跳），沒有要求是 null
   */
  update(dt: number): { busy: boolean; frameMs: number | null };
  setSize(width: number, height: number): void;
  /** 暖機：星軌的累積 pass 先畫一次，第一次切進手記時不用現場編譯 */
  warm(): void;
  dispose(): void;
}

/** 天極的方向（世界座標，相機在 +z 看向 -z）：畫面左上方、往畫面裡面 */
const POLE = new THREE.Vector3(-0.45, 0.55, -1).normalize();
/**
 * 星空繞天極轉的速度（rad/s）。真實的是 7.3e-5，這裡快一些才看得到軌跡長出來，
 * 但要慢到「讀著讀著才發現弧線變長了」——快了會像流星雨，看了頭暈
 */
const POLE_SPEED = 0.02;
/**
 * 以 60fps 為準的每幀保留比例：0.9985 的半衰期約 7.7 秒。
 * 不衰減的話待越久越密，最後整片蓋掉內容；衰減太快尾巴又短得像流星。這個值讓弧長停在
 * 二三十度左右、尾巴淡得很慢
 */
const TRAIL_KEEP_60 = 0.9985;

export function createSkyFx(opts: {
  renderer: THREE.WebGPURenderer;
  skyGroup: THREE.Object3D;
  width: number;
  height: number;
  dpr: number;
  sceneColor: TexNode;
  bloomColor: TexNode;
  camera: THREE.Camera;
  /** 現在能不能開始累積星軌：土星還在畫面上（碎裂途中）時不行 */
  canTrail: () => boolean;
}): SkyFx {
  const { renderer, skyGroup } = opts;

  // ── 拖出軌跡的星 ──
  // 只有這四百多顆亮星留下軌跡，背景那兩萬多顆照常是點。全部拖出來的話整片天空糊成灰色、看了頭暈。
  // 獨立一個場景、一般的材質：背景星的材質寫 MRT，畫不進單張 target。
  const TRAIL_STARS = 320;
  const trailScene = new THREE.Scene();
  const trailGroup = new THREE.Group();
  trailScene.add(trailGroup);
  {
    const pos = new Float32Array(TRAIL_STARS * 3);
    const tint = new Float32Array(TRAIL_STARS);
    const mag = new Float32Array(TRAIL_STARS);
    for (let i = 0; i < TRAIL_STARS; i++) {
      const r = 100 + Math.random() * 40;
      const th0 = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th0), r * Math.sin(ph) * Math.sin(th0), r * Math.cos(ph)], i * 3);
      tint[i] = Math.random();
      mag[i] = 0.35 + Math.pow(Math.random(), 2) * 0.65;
    }
    const mat = new THREE.PointsNodeMaterial();
    mat.positionNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const t = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(tint, 1), 'float');
    const m = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(mag, 1), 'float');
    // 真實星軌照片的顏色：大多偏白，少數偏藍或偏橘
    mat.colorNode = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.82, 0.62), t).mul(m.mul(1.2));
    const d = uv().sub(0.5).length().mul(2);
    mat.opacityNode = smoothstep(1, 0.3, d).mul(m);
    mat.size = 0.45;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    const stars = new THREE.Sprite(mat);
    stars.count = TRAIL_STARS;
    stars.frustumCulled = false;
    trailGroup.add(stars);
  }
  const dpr = opts.dpr;
  let mode: SkyMode = 'default';
  const trailMix = uniform(0);
  const pixelMix = uniform(0);
  const cellPx = uniform(1);
  const keep = uniform(TRAIL_KEEP_60);
  const warp = uniform(0);

  // ── 星軌：兩張輪流的累積 target ──
  // 以 CSS 像素的解析度存：星星本來就是柔光點，軌跡不需要裝置像素的精度，記憶體省 4 倍
  const rtOpts = { depthBuffer: false, type: THREE.HalfFloatType };
  const size = (w: number, h: number) => [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))] as const;
  let [tw, th] = size(opts.width, opts.height);
  const starsRT = new THREE.RenderTarget(tw, th, rtOpts);
  let latest = new THREE.RenderTarget(tw, th, rtOpts);
  let spare = new THREE.RenderTarget(tw, th, rtOpts);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevTex = texture(latest.texture, screenUV);
  const starsTex = texture(starsRT.texture, screenUV);
  const accMat = new THREE.MeshBasicNodeMaterial();
  accMat.vertexNode = vec4(positionGeometry.xy, 0, 1);
  // 取亮的那個，不是相加：相加的話同一顆星每幀疊一次，軌跡幾秒內就爆成白線
  accMat.fragmentNode = max(prevTex.mul(keep), starsTex);
  accMat.depthTest = false;
  accMat.depthWrite = false;
  accMat.blending = THREE.NoBlending;
  const accQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat);
  accQuad.frustumCulled = false;
  const accScene = new THREE.Scene();
  accScene.add(accQuad);
  const trailTex = texture(latest.texture, screenUV);
  let trailLive = false;

  const clearTargets = () => {
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const rt of [starsRT, latest, spare]) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
  };

  const accumulate = () => {
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    // 軌跡星跟著背景星空一起轉
    trailGroup.quaternion.copy(skyGroup.quaternion);
    renderer.setRenderTarget(starsRT);
    renderer.render(trailScene, opts.camera);
    renderer.setRenderTarget(spare);
    renderer.render(accScene, quadCam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
    [latest, spare] = [spare, latest];
    prevTex.value = latest.texture;
    trailTex.value = latest.texture;
  };

  // ── 像素抖動：4×4 Bayer 矩陣 ──
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayerData = new Uint8Array(16 * 4);
  BAYER.forEach((v, i) => bayerData.set([v * 16 + 8, 0, 0, 255], i * 4));
  const bayer = new THREE.DataTexture(bayerData, 4, 4, THREE.RGBAFormat);
  bayer.magFilter = THREE.NearestFilter;
  bayer.minFilter = THREE.NearestFilter;
  bayer.wrapS = THREE.RepeatWrapping;
  bayer.wrapT = THREE.RepeatWrapping;
  bayer.needsUpdate = true;

  return {
    output(sceneOut) {
      // 星軌疊在原本的畫面上（取亮的）
      // 軌跡比單顆星暗（拉長之後亮度攤開了），提一點才看得出長曝光
      // 壓暗：星軌是背景，不能跟文字搶
      const trail = trailTex.mul(trailMix.mul(0.6));
      let rgb = max(sceneOut.rgb, trail.rgb);

      // 換頁的飛行：從畫面中心往外的放射狀模糊，星星與土星拉成光線（跟首訪開場的超空間同一種語言）
      {
        const center = vec2(0.5, 0.5);
        const reach = warp.mul(0.32);
        let sum: Node<'vec3'> = vec3(0, 0, 0);
        const TAPS = 12;
        for (let i = 0; i < TAPS; i++) {
          const uv = center.add(screenUV.sub(center).mul(float(1).sub(reach.mul(i / (TAPS - 1)))));
          sum = sum.add((opts.sceneColor.sample(uv) as unknown as V4).rgb).add((opts.bloomColor.sample(uv) as unknown as V4).rgb);
        }
        // 不是平均：星星很小，平均下去就淡到看不見。累加才會拉出一條亮線
        const streaked = sum.mul(0.3);
        rgb = mix(rgb, max(rgb, streaked), smoothstep(0, 0.08, warp));
      }
      let alpha = max(sceneOut.a, trail.a);

      // 像素抖動：一格取四個點的最亮值，太小的星星才不會因為剛好沒取樣到而閃爍消失
      const pix = screenUV.mul(screenSize);
      const cellIdx = floor(pix.div(cellPx));
      const center = cellIdx.add(0.5).mul(cellPx).div(screenSize);
      const q = cellPx.mul(0.25).div(screenSize);
      const lumAt = (o: Node<'vec2'>) => {
        const uv = center.add(o);
        const at = (t: TexNode) => (t.sample(uv) as unknown as V4).rgb;
        const c = at(opts.sceneColor).add(at(opts.bloomColor));
        return dot(c, vec3(0.299, 0.587, 0.114));
      };
      const lum = max(
        max(lumAt(vec2(q.x.negate(), q.y.negate())), lumAt(vec2(q.x, q.y.negate()))),
        max(lumAt(vec2(q.x.negate(), q.y)), lumAt(q)),
      ).mul(2.2);
      const threshold = texture(bayer, mod(cellIdx, 4).add(0.5).div(4)).r;
      const on = step(threshold, clamp(lum, 0, 1));
      // 最亮的幾格用琥珀色，其他是冷白
      // 只有最亮的少數格是琥珀色；多了整片都是金點，壓在文字後面很吵
      const ink = mix(vec3(0.62, 0.68, 0.82), vec3(1.0, 0.62, 0.26), step(1.5, lum));
      const ground = vec3(0.0024, 0.0027, 0.0035);
      const dithered = mix(ground, ink, on);
      rgb = mix(rgb, dithered, pixelMix);
      alpha = mix(alpha, float(1), pixelMix);
      return vec4(rgb, alpha);
    },

    setWarp(amount) {
      warp.value = amount;
    },

    setMode(m) {
      mode = m;
    },

    update(dt) {
      const trailTarget = mode === 'notes' ? 1 : 0;
      const pixelTarget = mode === 'moments' ? 1 : 0;
      const towards = (v: number, target: number, seconds: number) =>
        target > v ? Math.min(target, v + dt / seconds) : Math.max(target, v - dt / seconds);
      trailMix.value = towards(trailMix.value, trailTarget, 1.2);
      pixelMix.value = towards(pixelMix.value, pixelTarget, 0.6);
      // 格子一級一級跳（1→2→3→4 個 CSS 像素），不是連續放大：吸附到格子上的感覺來自這個跳動
      cellPx.value = (1 + Math.round(pixelMix.value * 3)) * dpr;

      if (trailMix.value > 0 && opts.canTrail()) {
        skyGroup.rotateOnWorldAxis(POLE, dt * POLE_SPEED * trailMix.value);
        keep.value = Math.pow(TRAIL_KEEP_60, dt * 60);
        accumulate();
        trailLive = true;
      } else if (trailLive) {
        clearTargets();
        trailLive = false;
      }
      const busy = trailMix.value !== trailTarget || pixelMix.value !== pixelTarget || trailMix.value > 0;
      return { busy, frameMs: pixelMix.value > 0.5 ? 1000 / 12 : null };
    },

    setSize(width, height) {
      [tw, th] = size(width, height);
      for (const rt of [starsRT, latest, spare]) rt.setSize(tw, th);
      clearTargets();
    },

    warm() {
      accumulate();
      clearTargets();
    },

    dispose() {
      for (const rt of [starsRT, latest, spare]) rt.dispose();
      accQuad.geometry.dispose();
      accMat.dispose();
      bayer.dispose();
    },
  };
}
