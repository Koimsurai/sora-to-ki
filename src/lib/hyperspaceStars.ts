// 開場星芒的模擬——純 JS，不碰 three（lib/hyperspace.ts 把結果丟進 GPU 的 instanced 屬性）。
//
// 每幀輸出一串「要畫的線段」，順序就是繪製順序：每顆星先光暈（夠亮才有）、再亮核。
// 同一個 draw call 裡 GPU 會照 instance 順序混色，所以跟以前 2D canvas 逐條 stroke 的疊法一樣。

const STAR_COUNT = 700;
const IMMEDIATE_STAR_COUNT = 240;
const MAX_R_FACTOR = 0.75;
const FADE_IN_PX = 90;
const FADE_OUT_FACTOR = 0.85;
const STAGGER_SPAWN_WINDOW = 1200;
const SPEED_MIN = 80;
const SPEED_MAX = 1100;

/** 每顆星最多兩條（光暈＋亮核） */
export const MAX_STREAKS = STAR_COUNT * 2;

export const STREAK_GLOW = 0;
export const STREAK_CORE = 1;

interface Star {
  cos: number;
  sin: number;
  r: number;
  baseSpeed: number;
  streakLen: number;
  hueDrift: number;
  baseAlpha: number;
  spawnDelay: number;
  depthContrast: number;
  sat: number;
  thickness: number;
}

function spawnStar(): Star {
  // Wide speed range (≈14×) gives a natural depth illusion: slow stars
  // act as the "very distant" layer, but they still stream — physically
  // consistent with being inside a tunnel.
  const baseSpeed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  const angle = Math.random() * Math.PI * 2;
  const speedRatio = (baseSpeed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
  return {
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    r: 0,
    baseSpeed,
    streakLen: 25 + baseSpeed * 0.5,
    hueDrift: (Math.random() - 0.5) * 36,
    baseAlpha: 0.4 + Math.random() * 0.55,
    spawnDelay: 0,
    // Wide depth contrast so slow stars read as "distant background"
    // rather than blending with the foreground streaks.
    depthContrast: 0.12 + speedRatio * 0.93,
    // Slow stars: low saturation (≈ grey-white pinpoints).
    // Fast stars: higher saturation (≈ vivid blue/purple streaks).
    sat: Math.round(30 + speedRatio * 50),
    thickness: 0.3 + speedRatio * 2.2,
  };
}

/**
 * 每條線段 3 組 vec4（GPU 端的 instanced 屬性直接用這三個陣列）：
 *   a = (尾端 x, 尾端 y, cos, sin)       ——CSS px，原點在左上
 *   b = (長度, 線寬, 亮度, 色相)
 *   c = (飽和度, 種類, 0, 0)              ——種類：STREAK_GLOW / STREAK_CORE
 */
export interface StreakBuffers {
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  /** 這一幀實際要畫幾條 */
  count: number;
}

export interface HyperspaceStars {
  readonly buffers: StreakBuffers;
  /** elapsed：開場經過時間；dt：距上一幀（ms，會夾到 33）；width/height：CSS px */
  step(elapsed: number, dt: number, speedMult: number, width: number, height: number): void;
}

export function createHyperspaceStars(width: number, height: number): HyperspaceStars {
  const maxR0 = Math.hypot(width, height) * MAX_R_FACTOR;
  // Two-tier initial population:
  //   IMMEDIATE_STAR_COUNT pre-positioned at varied r — gives frame 1
  //   some context so the first 200 ms isn't black,
  //   the rest start at r=0 with a staggered spawnDelay so the tunnel
  //   visibly "fills in" over the first second instead of appearing
  //   fully formed.
  const stars = Array.from({ length: STAR_COUNT }, (_, i) => {
    const s = spawnStar();
    if (i < IMMEDIATE_STAR_COUNT) s.r = 60 + Math.random() * (maxR0 * 0.7 - 60);
    else s.spawnDelay = Math.random() * STAGGER_SPAWN_WINDOW;
    return s;
  });

  const buffers: StreakBuffers = {
    a: new Float32Array(MAX_STREAKS * 4),
    b: new Float32Array(MAX_STREAKS * 4),
    c: new Float32Array(MAX_STREAKS * 4),
    count: 0,
  };

  const push = (
    tx: number,
    ty: number,
    s: Star,
    len: number,
    width: number,
    intensity: number,
    hue: number,
    kind: number,
  ) => {
    const o = buffers.count * 4;
    buffers.a[o] = tx;
    buffers.a[o + 1] = ty;
    buffers.a[o + 2] = s.cos;
    buffers.a[o + 3] = s.sin;
    buffers.b[o] = len;
    buffers.b[o + 1] = width;
    buffers.b[o + 2] = intensity;
    buffers.b[o + 3] = hue;
    buffers.c[o] = s.sat;
    buffers.c[o + 1] = kind;
    buffers.count += 1;
  };

  return {
    buffers,
    step(elapsed, dtRaw, speedMult, w, h) {
      const dt = Math.min(dtRaw, 33);
      const maxR = Math.hypot(w, h) * MAX_R_FACTOR;
      const fadeOutStart = maxR * FADE_OUT_FACTOR;
      const fadeOutSpan = maxR - fadeOutStart;
      // Very subtle camera-handshake drift (almost imperceptible — large
      // amplitudes made the whole field look like it was floating).
      const cx = w / 2 + Math.sin(elapsed * 0.0009) * 5;
      const cy = h / 2 + Math.cos(elapsed * 0.0012) * 4;
      buffers.count = 0;

      for (const s of stars) {
        if (elapsed < s.spawnDelay) continue;
        s.r += s.baseSpeed * speedMult * (dt / 1000);
        if (s.r > maxR) {
          Object.assign(s, spawnStar());
          continue;
        }
        if (s.r < 4) continue;

        const tailR = Math.max(0, s.r - s.streakLen);
        const len = s.r - tailR;
        let radialAlpha;
        if (s.r < FADE_IN_PX) radialAlpha = s.r / FADE_IN_PX;
        else if (s.r > fadeOutStart) radialAlpha = 1 - (s.r - fadeOutStart) / fadeOutSpan;
        else radialAlpha = 1;

        const intensity = radialAlpha * s.baseAlpha * s.depthContrast * (0.3 + speedMult * 0.7);
        if (intensity < 0.02) continue;
        const hue = 200 + speedMult * 30 + s.hueDrift;
        const tx = cx + s.cos * tailR;
        const ty = cy + s.sin * tailR;
        if (intensity > 0.4) push(tx, ty, s, len, Math.max(2.2, intensity * 5.5), intensity, hue, STREAK_GLOW);
        push(tx, ty, s, len, Math.max(0.5, intensity * s.thickness), intensity, hue, STREAK_CORE);
      }
    },
  };
}
