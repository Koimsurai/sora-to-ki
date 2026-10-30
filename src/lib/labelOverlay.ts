// 首頁字卡與常駐小標註的 3D 那一半（主執行緒那一半見 store/canvasLabels）：瀏覽器畫好的 DOM 快照
// （HTML-in-Canvas 的 drawElementImageToTexture，只有 WebGPU 的路徑做了）在 worker 裡照衛星的位置擺好，
// 畫在整張圖的最上層。
//
// 要跟 DOM 版看起來一樣，所以這一層不進 3D 場景：
//   - 位置、淡入淡出、什麼時候讓位，跟 DOM 版用同一套（lib/orbitLabels、lib/cssTransition）
//   - 畫在螢幕座標、對齊裝置像素，快照一個像素對一個像素貼上去，字不會被重新取樣糊掉
//   - 疊上去的混色在 sRGB 的數值上做（starfieldGpu 最後一步，見 over）：DOM 的字疊在 canvas 上就是這樣混的。
//     在線性空間混的話，淺色字的反鋸齒邊緣會變細
//
// 字卡的每一行各自對齊（在右邊靠左、在左邊靠右、在下面置中），快照卻是整張拍的：照每一行的範圍切成橫條，
// 各自往右挪。外圍那一圈（鍵盤焦點的外框）不挪，跟 DOM 版的外框畫在字卡本身上一樣。
//
// 三個要注意的地方（實測過）：
//   - 快照的數值就是 sRGB，貼圖不標色彩空間（標 sRGB 會先轉成線性，這裡要的是原本的數值）
//   - 快照第 0 列是上緣，three 取樣 render target 時會上下翻，uv 照「上緣是 0」給
//   - 偶爾會丟「No context found for ElementImage」：快照還沒準備好，主執行緒下一幀再拍
import * as THREE from 'three/webgpu';
import { max, pass, select, sRGBTransferEOTF, sRGBTransferOETF, texture, uniform, uv, vec4 } from 'three/tsl';
import { transitionValue, type TransitionValue } from './cssTransition';
import { cardAt, cardShow, LABEL_FADE_MS, tagAt, tagShow, type OrbitFrame } from './orbitLabels';
import type { LabelBox, LabelGeometry, LabelImage, LabelShow } from '@/store/canvasLabels';
import type { SatelliteScreen } from '@/store/homeOrbit';

/** 一張字卡最多切幾塊：外圍四條，加上最多四行 */
const MAX_QUADS = 8;
/** 除以透明度時的下限（全透明的地方不除以 0） */
const EPS = 1e-5;

type Vec3 = THREE.Node<'vec3'>;
type Vec4 = THREE.Node<'vec4'>;

interface Item {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  uvs: THREE.BufferAttribute;
  map: ReturnType<typeof texture>;
  opacity: { value: number };
  rt: THREE.RenderTarget | null;
  gpuTexture: unknown;
  texW: number;
  texH: number;
  meta: Omit<LabelImage, 'image'> | null;
  fade: TransitionValue;
  /** 上一次寫進頂點的位置：沒動就不再上傳 */
  placed: string;
}

interface BackendWithTextures {
  device?: { queue: Partial<DrawElementImageQueue> };
  get(object: object): { texture?: unknown };
}

export interface LabelOverlay {
  /** 把這一層疊到 base（線性、預乘過透明度的最終畫面）上，混色照 DOM 疊在 canvas 上的方式 */
  over(base: Vec4): Vec4;
  /** 主執行緒拍好的快照；有沒傳上去的（快照還沒準備好）回 false，主執行緒下一幀再拍 */
  setImages(list: LabelImage[]): boolean;
  setShow(show: LabelShow): void;
  setView(width: number, height: number): void;
  /** 每幀：照衛星的位置擺好。回傳要交給主執行緒的框（跟上一次一樣就是 null）與是否還在淡入淡出 */
  update(
    now: number,
    positions: SatelliteScreen[],
    frame: OrbitFrame,
  ): { geometry: LabelGeometry | null; moving: boolean };
  /** 土星收起來了：立刻全部藏起來；回傳全是 null 的框（已經是了就 null） */
  hide(): LabelGeometry | null;
  dispose(): void;
}

/** 瀏覽器畫不了 DOM 快照（沒有 drawElementImageToTexture）時回 null，字照舊是 DOM */
export function createLabelOverlay(renderer: THREE.WebGPURenderer, dpr: number): LabelOverlay | null {
  const backend = renderer.backend as unknown as BackendWithTextures;
  const queue = backend.device?.queue;
  if (typeof queue?.drawElementImageToTexture !== 'function') return null;
  const scene = new THREE.Scene();
  // 螢幕座標（CSS 像素，y 朝下）：頂點寫 (x, -y)
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
  const items = { card: [] as Item[], tag: [] as Item[] };
  let show: LabelShow = { glow: [], leaving: false, still: false };
  let lastGeometry = '';
  const index = Array.from({ length: MAX_QUADS }, (_, q) => [0, 2, 1, 1, 2, 3].map((v) => q * 4 + v)).flat();

  const itemAt = (kind: LabelImage['kind'], i: number): Item => {
    const existing = items[kind][i] as Item | undefined;
    if (existing) return existing;
    const geometry = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3);
    const uvs = new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 2), 2);
    pos.setUsage(THREE.DynamicDrawUsage);
    uvs.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', pos);
    geometry.setAttribute('uv', uvs);
    geometry.setIndex(index);
    const map = texture(new THREE.Texture(), uv());
    const opacity = uniform(0);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    // 快照是沒有預乘的透明度：這裡乘上去，輸出預乘過的值（用已知顏色的半透明底驗過，見 over）。
    // 一般的「疊上去」：src + dst × (1 − srcα)
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.blendSrcAlpha = THREE.OneFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    mat.fragmentNode = vec4(map.rgb.mul(map.a).mul(opacity), map.a.mul(opacity));
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    const item: Item = {
      mesh,
      pos,
      uvs,
      map,
      opacity,
      rt: null,
      gpuTexture: null,
      texW: 0,
      texH: 0,
      meta: null,
      fade: transitionValue(0),
      placed: '',
    };
    items[kind][i] = item;
    return item;
  };

  /** 尺寸變了才重配貼圖（重配會清掉內容） */
  const fit = (item: Item, w: number, h: number) => {
    const texW = Math.max(1, Math.ceil(w * dpr));
    const texH = Math.max(1, Math.ceil(h * dpr));
    if (item.rt && item.texW === texW && item.texH === texH) return;
    item.rt?.dispose();
    const rt = new THREE.RenderTarget(texW, texH, { depthBuffer: false });
    rt.texture.colorSpace = THREE.NoColorSpace;
    // r187 起有 initRenderTarget：先配好 GPU 貼圖，快照直接寫進去（@types/three 還停在 0.186）
    (renderer as unknown as { initRenderTarget(target: THREE.RenderTarget): void }).initRenderTarget(rt);
    item.rt = rt;
    item.gpuTexture = backend.get(rt.texture).texture;
    item.texW = texW;
    item.texH = texH;
    item.map.value = rt.texture;
    item.placed = '';
  };

  const snap = (v: number) => Math.round(v * dpr) / dpr;

  /**
   * 把切好的幾塊寫進頂點：每一塊是快照裡的 (sx, sy, sw, sh)，貼到畫面上的 (dx, dy)（CSS 像素）。
   * 快照一個像素對一個像素：貼圖寬度進位到整數裝置像素時，畫的大小跟著同一個比例
   */
  const place = (item: Item, quads: number[][]) => {
    const meta = item.meta;
    if (!meta) return;
    const key = quads.map((q) => q.join(',')).join(';');
    if (key === item.placed) return;
    item.placed = key;
    const kx = item.texW / dpr / meta.w;
    const ky = item.texH / dpr / meta.h;
    const p = item.pos.array as Float32Array;
    const t = item.uvs.array as Float32Array;
    for (const [q, [sx, sy, sw, sh, dx, dy]] of quads.entries()) {
      const x0 = dx;
      const y0 = dy;
      const x1 = dx + sw * kx;
      const y1 = dy + sh * ky;
      p.set([x0, -y0, 0, x1, -y0, 0, x0, -y1, 0, x1, -y1, 0], q * 12);
      const u0 = sx / meta.w;
      const v0 = sy / meta.h;
      const u1 = (sx + sw) / meta.w;
      const v1 = (sy + sh) / meta.h;
      t.set([u0, v0, u1, v0, u0, v1, u1, v1], q * 8);
    }
    item.pos.needsUpdate = true;
    item.uvs.needsUpdate = true;
    item.mesh.geometry.setDrawRange(0, quads.length * 6);
  };

  /** 字卡切成外圍四條（不挪）與每一行（照 fx 往右挪），內容框的左上角落在 (x, y) */
  const cardQuads = (meta: Omit<LabelImage, 'image'>, x: number, y: number, fx: number) => {
    const { w, h, ox, oy } = meta;
    const lines = (meta.lines ?? []).slice(0, MAX_QUADS - 4);
    const cw = w - 2 * ox;
    const ch = h - 2 * oy;
    const left = snap(x - ox);
    const top = snap(y - oy);
    const quads: number[][] = [];
    if (oy > 0) {
      quads.push([0, 0, w, oy, left, top]);
      quads.push([0, h - oy, w, oy, left, top + h - oy]);
    }
    if (ox > 0) {
      quads.push([0, oy, ox, ch, left, top + oy]);
      quads.push([w - ox, oy, ox, ch, left + w - ox, top + oy]);
    }
    for (const [k, line] of lines.entries()) {
      // 一行的範圍是從它的上緣到下一行的上緣（行距也一起帶走，字的上下突出不會被切掉）
      const from = k === 0 ? 0 : line.top;
      const to = k + 1 < lines.length ? lines[k + 1].top : ch;
      quads.push([ox, oy + from, cw, to - from, left + ox + snap((cw - line.w) * fx), top + oy + from]);
    }
    return { quads, left, top };
  };

  return {
    over(base) {
      const layer = pass(scene, camera).getTextureNode('output');
      // 輸出那一步把顏色轉成 sRGB 時是「先除掉透明度、轉、再乘回去」（用已知顏色的半透明底實測：
      // 白色 50% 疊在 14 上出來是 94，照這個算正好）。所以先照同一個規則算出 canvas 上原本的 sRGB 數值，
      // 在這個數值上跟字混（DOM 的字疊在 canvas 上就是這樣混的），再反推回輸出那一步要的線性值
      // （@types/three 把這兩個函式標成回傳沒有型別的 Node）
      const toSrgb = (rgb: Vec3, a: THREE.Node<'float'>) => (sRGBTransferOETF(rgb.div(max(a, EPS))) as Vec3).mul(a);
      const toLinear = (rgb: Vec3, a: THREE.Node<'float'>) => (sRGBTransferEOTF(rgb.div(max(a, EPS))) as Vec3).mul(a);
      const alpha = base.a.add(layer.a.mul(base.a.oneMinus()));
      const srgb = toSrgb(base.rgb, base.a).mul(layer.a.oneMinus()).add(layer.rgb);
      const mixed = vec4(toLinear(srgb, alpha), alpha);
      // 沒有字的地方原封不動（來回轉一次的誤差也不要）
      return select(layer.a.greaterThan(0), mixed, base);
    },
    setImages(list) {
      let ok = true;
      for (const { image, ...meta } of list) {
        const item = itemAt(meta.kind, meta.i);
        try {
          fit(item, meta.w, meta.h);
          queue.drawElementImageToTexture?.(
            { source: image },
            { texture: item.gpuTexture, size: { width: item.texW, height: item.texH } },
          );
          item.meta = meta;
          item.placed = '';
        } catch {
          ok = false;
        }
        image.close();
      }
      return ok;
    },
    setShow(next) {
      show = next;
    },
    setView(width, height) {
      camera.right = width;
      camera.bottom = -height;
      camera.updateProjectionMatrix();
    },
    update(now, positions, frame) {
      let moving = false;
      const geometry: LabelGeometry = { cards: [], tags: [] };
      const duration = show.still ? 0 : LABEL_FADE_MS;
      const fadeTo = (item: Item, target: number) => {
        item.fade.set(target, now, duration);
        const v = item.fade.at(now);
        if (item.fade.running(now)) moving = true;
        item.opacity.value = v;
        item.mesh.visible = v > 0;
        return v;
      };
      const count = Math.max(items.card.length, items.tag.length);
      for (let i = 0; i < count; i++) {
        const p = positions[i] as SatelliteScreen | undefined;
        const card = items.card[i] as Item | undefined;
        const tag = items.tag[i] as Item | undefined;
        const cardTarget = p ? cardShow(show.glow[i] ?? 0, p.hidden, show.leaving, frame) : 0;
        if (card) {
          const v = fadeTo(card, card.meta ? cardTarget : 0);
          let box: LabelBox = null;
          if (p && card.meta && v > 0) {
            const { w, h, ox, oy } = card.meta;
            const at = cardAt(p, { w: w - 2 * ox, h: h - 2 * oy }, frame);
            const { quads, left, top } = cardQuads(card.meta, at.x, at.y, at.fx);
            place(card, quads);
            // 點得到：跟 DOM 版的 .is-on 一樣，看目標亮度不看淡到哪
            if (cardTarget > 0.6) box = { x: left, y: top };
          }
          geometry.cards[i] = box;
        }
        if (tag) {
          const target = p && tag.meta ? tagShow(cardTarget, p.hidden, show.leaving, frame) : 0;
          const v = fadeTo(tag, target);
          let box: LabelBox = null;
          if (p && tag.meta && v > 0) {
            const { w, h, ox, oy } = tag.meta;
            const at = tagAt(p, { w, h }, frame);
            // DOM 版是含 margin 擺的：畫出來的 border box 在 margin 那一側
            const left = snap(at.x + ox);
            const top = snap(at.y + oy);
            place(tag, [[0, 0, w, h, left, top]]);
            if (target > 0.5) box = { x: left, y: top };
          }
          geometry.tags[i] = box;
        }
      }
      const key = JSON.stringify(geometry);
      if (key === lastGeometry) return { geometry: null, moving };
      lastGeometry = key;
      return { geometry, moving };
    },
    hide() {
      for (const item of [...items.card, ...items.tag]) {
        item.fade = transitionValue(0);
        item.opacity.value = 0;
        item.mesh.visible = false;
      }
      const geometry: LabelGeometry = { cards: items.card.map(() => null), tags: items.tag.map(() => null) };
      const key = JSON.stringify(geometry);
      if (key === lastGeometry) return null;
      lastGeometry = key;
      return geometry;
    },
    dispose() {
      for (const item of [...items.card, ...items.tag]) {
        item.rt?.dispose();
        item.mesh.geometry.dispose();
        (item.mesh.material as THREE.Material).dispose();
      }
    },
  };
}
