// 每個分區的天空（星軌、像素抖動），疊在星空 runner 的最後一道輸出上。
//
// 換頁時不是換一張背景，而是同一片星星在變：
//   星軌（手記）：整片星空繞著天極轉，每幀把星星疊進一張常駐的 render target，舊的慢慢變暗
//                 ——就是長曝光。軌跡會從零開始累積，所以「切進來的那幾秒」本身就是轉場。
//   像素抖動（碎念）：最後的畫面按格子取樣、用 4×4 Bayer 矩陣二值化，格子一級一級長到 5 px。
//                 進出碎念頁時格子先放大成大方塊、換好位置再收回來（見 starfieldGpu 的 blink）。
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
  /**
   * 星軌開了多少（0–1）。開著的時候背景星各層自己的慢速自轉要停下來：只能有「繞天極」這一個旋轉，
   * 否則兩層各自拖出一組圓心不同的弧，整片星軌是歪的
   */
  trailing(): number;
  /** 關於頁往下捲的速度（0–1）：星空往上掠過時拖出的線，跟飛行同一套，只是沒有放射狀的光線 */
  setDrift(speed: number): void;
  /**
   * 直接指定像素化的程度（0–1），null 交回給天空模式自己淡進淡出。碎念頁用：土星滑到頁首的位置，
   * 停下來的那一刻才一格一格碎成像素，跟著土星的移動走，不是另外計時
   */
  setPixel(amount: number | null): void;
  /** 像素格的原點（CSS 像素、視窗座標）：對齊頁首那張點陣畫布的格子 */
  setGrid(x: number, y: number): void;
  /** 直接指定格子大小（CSS 像素）：進出碎念頁時整個畫面碎成大方塊再收回來。null 交回給像素化程度決定 */
  setMosaic(cell: number | null): void;
  /** 像素點的亮度（0–1）：碎念頁往下捲時背景退暗，不搶內容 */
  setInk(level: number): void;
  /** 鏡頭瞬間換了位置（碎念頁的轉場）：軌跡從新的位置重新開始，不從舊位置拉一條線過來 */
  jump(): void;
  /**
   * 換頁飛行的速度，0–1：畫面拉成光線、星星拖出動態的軌跡。
   * dir：out 是往前飛（從畫面中央往外拉），up 是往下墜（光線從畫面下方往上拉成直線）
   */
  setFlight(speed: number, dir?: 'out' | 'up'): void;
  /**
   * 推進一幀。回傳：
   *   busy：還在轉場（要跟著 60fps 畫）
   */
  update(dt: number): { busy: boolean };
  setSize(width: number, height: number): void;
  /** 暖機：星軌的累積 pass 先畫一次，第一次切進手記時不用現場編譯 */
  warm(): void;
  dispose(): void;
}

/**
 * 天極的方向（世界座標）。手記頁的鏡頭停在飛過土星之後的位置、看向 -z，這個方向投影在畫面右上
 * （約 80%、18%）：面板右邊、樹的上方那塊沒有內容的夜空。天極要在畫面上看得到——星軌好看的
 * 地方是天極附近一圈一圈的同心圓；天極在畫面外的話，看到的只是一片半徑很大、近乎直線的弧。
 */
const POLE = new THREE.Vector3(0.74, 0.49, -1).normalize();
/**
 * 星空繞天極轉的速度（rad/s）。真實的是 7.3e-5，這裡快一些才看得到軌跡長出來，
 * 但要慢到「讀著讀著才發現弧線變長了」——快了會像流星雨，看了頭暈
 */
const POLE_SPEED = 0.04;
/**
 * 以 60fps 為準的每幀保留比例：0.999 的半衰期約 11.5 秒。
 * 不衰減的話待越久越密，最後整片蓋掉內容；衰減太快尾巴又短得像流星。配上面的轉速，
 * 弧長停在四十度上下、尾巴淡得很慢
 */
const TRAIL_KEEP_60 = 0.999;
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
    // 柔光的邊緣直接乘進顏色（預乘）：下面的「取最大值」混合不會再拿 alpha 去乘
    const d = uv().sub(0.5).length().mul(2);
    const soft = smoothstep(1, 0.3, d);
    mat.colorNode = mix(vec3(1, 1, 1), mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.78), t), 0.35).mul(soft);
    mat.opacityNode = soft;
    mat.scaleNode = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(scale, 1), 'float');
    mat.size = (layer.material as THREE.PointsNodeMaterial).size * 0.8;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    // 取最亮值而不是相加：飛行時同一幀會在幾個子步驟各畫一次，相加的話慢的地方會疊到爆白
    // ⚠ WebGPU 規定 max 運算的兩個係數都必須是 one，否則整條 pipeline 建立失敗、一顆都畫不出來
    //   （WebGL2 會忽略係數，所以只在 WebGL2 上測是測不到的）
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.MaxEquation;
    mat.blendEquationAlpha = THREE.MaxEquation;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendSrcAlpha = THREE.OneFactor;
    mat.blendDstAlpha = THREE.OneFactor;
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
  /** 像素格的原點（裝置像素）：對齊碎念頁頁首那張點陣畫布的格子，兩邊的點才落在同一格上 */
  const gridOrigin = uniform(new THREE.Vector2(0, 0));
  /** 外面直接指定的像素化程度（碎念頁的轉場）；null 時照天空模式自己淡進淡出 */
  let pixelDrive: number | null = null;
  let mosaic: number | null = null;
  const inkLevel = uniform(1);
  const keep = uniform(TRAIL_KEEP_60);
  const warp = uniform(0);
  /** 光線的消失點（螢幕座標，左上是 0）與拉長的比例：往前飛是畫面中央，往下墜是畫面下方很遠的地方 */
  const warpCenter = uniform(new THREE.Vector2(0.5, 0.5));
  const warpReach = uniform(0.32);
  /** 軌跡疊上去的強度：手記的星軌，或飛行中的動態軌跡，取大的 */
  const streakMix = uniform(0);
  let flightSpeed = 0;
  /** 剛飛完的那一小段（秒）：動態的線要在這段時間裡收乾淨，不然會殘留成一片跟星軌方向不同的斜線 */
  let afterFlight = 0;
  let drift = 0;
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
  const prevSky = skyGroup.quaternion.clone();
  const accumulate = (substeps: number) => {
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    // 軌跡星跟著背景星空一起轉：天極的旋轉、關於頁的下墜（skyGroup，子步驟之間也插補）
    // 加上每層自己的慢速自轉
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
      trailGroup.quaternion.slerpQuaternions(prevSky, skyGroup.quaternion, t);
      renderer.render(trailScene, subCam);
    }
    renderer.autoClear = autoClear;
    prevPos.copy(cam.position);
    prevQuat.copy(cam.quaternion);
    prevSky.copy(skyGroup.quaternion);
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
      // 土星（不透明、場景 alpha 是 1 的地方）前面不畫軌跡：飛過土星時星星的尾巴不能穿過星球。
      // 用 alpha 不用深度貼圖：深度在多重取樣的 pass 上各後端的行為不一，alpha 兩邊都一樣
      const open = float(1).sub(step(0.98, sceneOut.a));
      const trail = trailTex.mul(streakMix.mul(0.6).mul(open));
      let rgb = max(sceneOut.rgb, trail.rgb);

      // 換頁的飛行：從畫面中心往外的放射狀模糊，星星與土星拉成光線（跟首訪開場的超空間同一種語言）
      {
        const center = warpCenter;
        const reach = warp.mul(warpReach);
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
      const pix = screenUV.mul(screenSize).sub(gridOrigin);
      const cellIdx = floor(pix.div(cellPx));
      const center = cellIdx.add(0.5).mul(cellPx).add(gridOrigin).div(screenSize);
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
      );
      // 土星（與衛星）是不透明的，場景 alpha 是 1：那幾格用琥珀色，明暗照球面的光影走（背光那側疏）。
      // 星星與環是冷白，亮的幾格更白。顏色跟頁首那張點陣畫布同一組（lib/ditherScene）
      const solid = step(0.98, (opts.sceneColor.sample(center) as unknown as V4).a);
      // 星星的門檻刻意壓高：只有夠亮的星才變成點，整片撒滿的話字會看不清楚
      const level = clamp(mix(lum.mul(1.3), lum.mul(0.8), solid), 0, 1);
      const threshold = texture(bayer, mod(cellIdx, 4).add(0.5).div(4)).r;
      // 格子之間留一條 1 px 的縫（格子長到 3 px 以上才留），跟畫布那邊一樣是一顆一顆的點
      const local = pix.sub(cellIdx.mul(cellPx));
      const seam = step(cellPx.sub(dpr), max(local.x, local.y)).mul(step(dpr * 2.5, cellPx));
      const on = step(threshold, level).mul(float(1).sub(seam));
      const amber = vec3(0.815, 0.479, 0.127);
      const cold = mix(vec3(0.17, 0.21, 0.33), vec3(0.6, 0.65, 0.85), step(0.9, lum.mul(1.3)));
      const ink = mix(cold, amber, solid).mul(inkLevel);
      // 沒亮的格子是透明的，底下是頁面本來的紫黑底色：碎念跟其他頁站在同一個底上，只是星星變成點
      const dithered = ink.mul(on);
      rgb = mix(rgb, dithered, pixelMix);
      alpha = mix(alpha, on, pixelMix);
      return vec4(rgb, alpha);
    },

    setDrift(speed) {
      drift = speed;
    },

    setPixel(amount) {
      pixelDrive = amount;
    },

    setGrid(x, y) {
      gridOrigin.value.set(x * dpr, y * dpr);
    },

    setMosaic(cell) {
      mosaic = cell;
    },

    setInk(level) {
      inkLevel.value = level;
    },

    jump() {
      prevPos.copy(cam.position);
      prevQuat.copy(cam.quaternion);
      prevSky.copy(skyGroup.quaternion);
      clearTargets();
    },

    setFlight(speed, dir = 'out') {
      flightSpeed = speed;
      warp.value = speed * 0.55;
      if (dir === 'up') {
        warpCenter.value.set(0.5, 3);
        warpReach.value = 0.12;
      } else {
        warpCenter.value.set(0.5, 0.5);
        warpReach.value = 0.32;
      }
    },

    trailing() {
      return trailMix.value;
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
      pixelMix.value = pixelDrive ?? towards(pixelMix.value, pixelTarget, 0.6);
      // 格子一級一級跳（1→2→3→4→5 個 CSS 像素），不是連續放大：吸附到格子上的感覺來自這個跳動。
      // 最後是 5 px，跟碎念頁頁首的點陣畫布同一個大小
      cellPx.value = (mosaic ?? 1 + Math.round(pixelMix.value * 4)) * dpr;

      // 飛行中：同一批星、同一張累積 target，只是尾巴短（跟著速度）——鏡頭在動，星星就拖出線。
      // 抵達手記時速度歸零、保留比例慢慢回到長曝光，動態的線直接接成星軌，中間沒有換手。
      // 關於頁往下捲（drift）也是同一回事：星空在動，星星就拖出線；停下來時線不是瞬間消失，
      // 而是在 FLUSH_SECONDS 內很快淡掉（保留比例拉低、疊上去的強度跟著退）
      const rotating = trailMix.value > 0 && opts.canTrail();
      const flying = flightSpeed > 0.001;
      const drifting = drift > 0.01;
      const moving = flying || drifting;
      afterFlight = moving ? FLUSH_SECONDS : Math.max(0, afterFlight - dt);
      const streakTarget = Math.max(
        rotating ? trailMix.value : 0,
        smoothstep01(flightSpeed / 0.15),
        smoothstep01(drift / 0.15) * 0.8,
      );
      streakMix.value = Math.max(streakTarget, streakMix.value - dt / FLUSH_SECONDS);
      if (rotating || moving || afterFlight > 0) {
        if (rotating) skyGroup.rotateOnWorldAxis(POLE, dt * POLE_SPEED * trailMix.value);
        const fast = Math.max(
          smoothstep01(flightSpeed / 0.3),
          smoothstep01(drift / 0.3),
          moving ? 0 : afterFlight / FLUSH_SECONDS,
        );
        const keep60 = TRAIL_KEEP_60 + (FLIGHT_KEEP_60 - TRAIL_KEEP_60) * fast;
        keep.value = Math.pow(keep60, dt * 60);
        accumulate(flying ? 8 : drifting ? 6 : 1);
        trailLive = true;
      } else {
        if (trailLive) clearTargets();
        trailLive = false;
        // 沒在累積時也要跟上鏡頭與星空，否則下一次起飛的第一幀會從很久以前的位置拉一條線過來
        prevPos.copy(cam.position);
        prevQuat.copy(cam.quaternion);
        prevSky.copy(skyGroup.quaternion);
      }
      const busy =
        trailMix.value !== trailTarget ||
        pixelMix.value !== (pixelDrive ?? pixelTarget) ||
        mosaic !== null ||
        trailMix.value > 0 ||
        moving ||
        afterFlight > 0;
      return { busy };
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
