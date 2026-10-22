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
  /** 換頁飛行的速度，0–1：畫面往中心拉成光線、星星拖出動態的軌跡 */
  setFlight(speed: number): void;
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
/** 飛行全速時的每幀保留比例：尾巴只留幾十像素，是「速度」不是「時間」 */
const FLIGHT_KEEP_60 = 0.9;
/** 每一層背景星裡拖出軌跡的顆數（取最亮的） */
const TRAIL_PER_LAYER = 500;

const smoothstep01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function createSkyFx(opts: {
  renderer: THREE.WebGPURenderer;
  skyGroup: THREE.Object3D;
  /** 背景星空的各層（skyGroup 的子節點），userData 帶 positions / scales / tints */
  starLayers: THREE.Sprite[];
  /** 場景 pass 的深度：星軌不能畫到土星前面 */
  sceneDepth: TexNode;
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
  // 就是背景裡最亮的那一千多顆星本身（同樣的位置、大小、色溫），不是另外撒的一批：
  // 軌跡從畫面上本來就在的星長出來，不會有「不知道從哪冒出來的線」。
  // 其餘兩萬多顆照常是點，全部拖出來的話整片天空糊成灰色、看了頭暈。
  // 獨立一個場景、一般的材質：背景星的材質寫 MRT，畫不進單張 target。
  // 每層一個 holder，畫之前抄那一層當下的自轉，軌跡星才跟背景星對得上。
  const trailScene = new THREE.Scene();
  const trailGroup = new THREE.Group();
  trailScene.add(trailGroup);
  const holders = opts.starLayers.map((layer) => {
    const all = layer.userData as { positions: Float32Array; scales: Float32Array; tints: Float32Array };
    const order = Array.from(all.scales.keys()).sort((a, b) => all.scales[b] - all.scales[a]);
    const pick = order.slice(0, TRAIL_PER_LAYER);
    const pos = new Float32Array(pick.length * 3);
    const scale = new Float32Array(pick.length);
    const tint = new Float32Array(pick.length);
    pick.forEach((src, i) => {
      pos.set(all.positions.subarray(src * 3, src * 3 + 3), i * 3);
      scale[i] = all.scales[src];
      tint[i] = all.tints[src];
    });
    const mat = new THREE.PointsNodeMaterial();
    mat.positionNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const t = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(tint, 1), 'float');
    // 色溫跟背景星同一條公式（見 starfieldGpu 的 buildStarLayer），亮度壓低：軌跡頭藏在星的光暈裡
    mat.colorNode = mix(vec3(1, 1, 1), mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.78), t), 0.35);
    const d = uv().sub(0.5).length().mul(2);
    mat.opacityNode = smoothstep(1, 0.3, d);
    mat.scaleNode = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(scale, 1), 'float');
    mat.size = (layer.material as THREE.PointsNodeMaterial).size * 0.8;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    // 取最亮值而不是相加：飛行時同一幀會在幾個子步驟各畫一次，相加的話慢的地方會疊到爆白
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.MaxEquation;
    const stars = new THREE.Sprite(mat);
    stars.count = pick.length;
    stars.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(stars);
    trailGroup.add(holder);
    return { holder, layer };
  });
  const dpr = opts.dpr;
  let mode: SkyMode = 'default';
  const trailMix = uniform(0);
  const pixelMix = uniform(0);
  const cellPx = uniform(1);
  const keep = uniform(TRAIL_KEEP_60);
  const warp = uniform(0);
  /** 軌跡疊上去的強度：手記的星軌，或飛行中的動態軌跡，取大的 */
  const streakMix = uniform(0);
  let flightSpeed = 0;
  /** 剛飛完的那一小段（秒）：動態的線要在這段時間裡收乾淨，不然會殘留成一片跟星軌方向不同的斜線 */
  let afterFlight = 0;
  const FLUSH_SECONDS = 0.7;

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

  // 飛行時鏡頭一幀可以移動好幾個像素，每幀只畫一次的話軌跡是一串點（幀率低時更明顯）。
  // 在上一幀與這一幀的鏡頭姿態之間插幾個子步驟各畫一次，線才是連續的
  const cam = opts.camera as THREE.PerspectiveCamera;
  const subCam = cam.clone();
  const prevPos = cam.position.clone();
  const prevQuat = cam.quaternion.clone();
  const accumulate = (substeps: number) => {
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    // 軌跡星跟著背景星空一起轉：天極的旋轉（skyGroup）加上每層自己的慢速自轉
    trailGroup.quaternion.copy(skyGroup.quaternion);
    for (const { holder, layer } of holders) holder.rotation.copy(layer.rotation);
    renderer.setRenderTarget(starsRT);
    renderer.clear();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    subCam.projectionMatrix.copy(cam.projectionMatrix);
    subCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    for (let s = 1; s <= substeps; s++) {
      const t = s / substeps;
      subCam.position.lerpVectors(prevPos, cam.position, t);
      subCam.quaternion.slerpQuaternions(prevQuat, cam.quaternion, t);
      subCam.updateMatrixWorld(true);
      renderer.render(trailScene, subCam);
    }
    renderer.autoClear = autoClear;
    prevPos.copy(cam.position);
    prevQuat.copy(cam.quaternion);
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
      // 土星（寫了深度的地方）前面不畫軌跡：飛過土星時星星的尾巴不能穿過星球
      const open = step(0.9999, (opts.sceneDepth as unknown as Node<'float'>).x);
      const trail = trailTex.mul(streakMix.mul(0.6).mul(open));
      let rgb = max(sceneOut.rgb, trail.rgb);

      // 換頁的飛行：從畫面中心往外的放射狀模糊，星星與土星拉成光線（跟首訪開場的超空間同一種語言）
      {
        const center = vec2(0.5, 0.5);
        const reach = warp.mul(0.32);
        // 沿著往中心的那條線取「最亮值」，越遠越淡——星星拉成同樣亮的線，大面積的亮處（土星）
        // 不會因為累加而爆白（累加的版本移動時土星整顆過曝）
        let streaked: Node<'vec3'> = vec3(0, 0, 0);
        const TAPS = 12;
        for (let i = 0; i < TAPS; i++) {
          const uv = center.add(screenUV.sub(center).mul(float(1).sub(reach.mul(i / (TAPS - 1)))));
          const c = (opts.sceneColor.sample(uv) as unknown as V4).rgb.add(
            (opts.bloomColor.sample(uv) as unknown as V4).rgb,
          );
          streaked = max(streaked, c.mul(1 - (i / TAPS) * 0.7));
        }
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

    setFlight(speed) {
      flightSpeed = speed;
      warp.value = speed * 0.55;
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

      // 飛行中：同一批星、同一張累積 target，只是尾巴短（跟著速度）——鏡頭在動，星星就拖出線。
      // 抵達手記時速度歸零、保留比例慢慢回到長曝光，動態的線直接接成星軌，中間沒有換手。
      const rotating = trailMix.value > 0 && opts.canTrail();
      const flying = flightSpeed > 0.001;
      afterFlight = flying ? FLUSH_SECONDS : Math.max(0, afterFlight - dt);
      streakMix.value = Math.max(rotating ? trailMix.value : 0, smoothstep01(flightSpeed / 0.15));
      if (rotating || flying) {
        if (rotating) skyGroup.rotateOnWorldAxis(POLE, dt * POLE_SPEED * trailMix.value);
        const fast = Math.max(smoothstep01(flightSpeed / 0.3), flying ? 0 : afterFlight / FLUSH_SECONDS);
        const keep60 = TRAIL_KEEP_60 + (FLIGHT_KEEP_60 - TRAIL_KEEP_60) * fast;
        keep.value = Math.pow(keep60, dt * 60);
        accumulate(flying ? 8 : 1);
        trailLive = true;
      } else {
        if (trailLive) clearTargets();
        trailLive = false;
        // 沒在累積時也要跟上鏡頭，否則下一次起飛的第一幀會從很久以前的位置拉一條線過來
        prevPos.copy(cam.position);
        prevQuat.copy(cam.quaternion);
      }
      const busy = trailMix.value !== trailTarget || pixelMix.value !== pixelTarget || trailMix.value > 0 || flying;
      return { busy, frameMs: pixelMix.value > 0.5 ? 1000 / 12 : null };
    },

    setSize(width, height) {
      [tw, th] = size(width, height);
      for (const rt of [starsRT, latest, spare]) rt.setSize(tw, th);
      clearTargets();
    },

    warm() {
      accumulate(1);
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
