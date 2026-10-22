// 手記天空底下那片地景的共用工具：前後兩層（背景的遠山、手記頁裡的近地與樹）
// 用同一個種子與同一個面板範圍，才會像同一片地。

/** 決定性的亂數（mulberry32）：每次畫出來的山形都一樣 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 一維的分形雜訊（幾層 value noise 疊起來），回傳約 -1..1。
 * 正弦波疊出來的山太規則，一看就是函數；這個才有「稜線」的感覺。
 */
export function ridgeNoise(seed: number, octaves = 5) {
  const R = rng(seed);
  const table = Float32Array.from({ length: 512 }, () => R() * 2 - 1);
  const at = (i: number) => table[((i % 512) + 512) % 512];
  const smooth = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return at(i) * (1 - u) + at(i + 1) * u;
  };
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += smooth(x * freq + o * 37.1) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };
}

/** 手記面板在視窗裡的左右邊界（跟 NotesSky.css 的 .notes-page：max-width 880、左右 24 的留白一致） */
export function panelSpan(width: number) {
  const left = (width - Math.min(width, 880)) / 2 + 24;
  return { left, right: width - left };
}

/** 首頁飛到手記那段飛行的長度（starfieldGpu 的 TRAVEL_SECONDS） */
export const FLIGHT_MS = 2200;

/**
 * 這一頁是不是從首頁飛過來的、已經飛了多久（ms）；不是的話回 null。
 * 頁面可能在飛到一半才掛上（資料還在載），所以不能假設「掛上的那一刻就是起飛的那一刻」。
 * <html data-sky> 還是 home 代表 SpaceBackdropShell 的 effect 還沒跑，也就是剛起飛。
 */
export function flightElapsed(): number | null {
  const root = document.documentElement;
  if (root.dataset.sky === 'home') return 0;
  if (root.dataset.sky !== 'notes' || root.dataset.prevSky !== 'home') return null;
  const ms = performance.now() - Number(root.dataset.skySince ?? Number.NEGATIVE_INFINITY);
  return ms < FLIGHT_MS ? ms : null;
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
