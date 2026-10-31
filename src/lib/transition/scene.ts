// 換頁轉場的場景：一趟轉場的運動（點、鏡頭、彗尾、塵埃與各主題的那一筆）與畫法。不碰 DOM——
// 碰 DOM 的事（頁面怎麼擺、data-pt、開場的環、交棒給頁面）透過 SceneEffects 交給呼叫端（layout/TransitionLayer），
// 要讀頁面的（頁面給的那一點、新的一頁的錨點與路、換主題之後頁面的線）由呼叫端讀好當資料送進來。
// 所以它可以整包搬進 worker：效果變成送回主執行緒的訊息，資料變成送進來的訊息。
//
//   收  點在頁面給的那一點亮起來（leave）
//   飛  新的一頁還沒報到：點順著原本的方向滑出去、慢慢減速；報到了（plan）：對焦、跟拍、煞停
//   長  點落地，新的一頁接手自己的進場；彗尾、塵埃散完就結束
import type { Pt } from '@/store/pageTransition';
import {
  clamp,
  cumulative,
  easeOut,
  escape,
  flightAt,
  flyby,
  hermite,
  len,
  pointAt,
  smooth,
  unit,
  type Flight,
  type Path,
} from './geometry';
import { createPainter, SLING_BODY_R, type PaintState, type PaintStyle, type Stretch, type Trail } from './paint';

/** 預設的收：一圈遮罩收進錨點（點在這段時間裡亮起來） */
export const LEAVE_MS = 380;
export const GROW_MS = 480;
/** 點飛行的基準速度（px/ms）：決定一段路要飛多久 */
const SPEED = 1.6;
/** 飛行時間的上下限（ms，不含對焦） */
const FLY_MIN_MS = 700;
const FLY_MAX_MS = 1400;
/** 對焦：鏡頭移到點上要多久（ms） */
const ACQUIRE_MIN_MS = 140;
const ACQUIRE_MAX_MS = 360;
/** 跟拍那段至少飛多遠（視窗短邊的倍數） */
const TRAVEL = 0.42;
/** 點已經在錨點上、頁面那一點還在動的時候（手記推近），新的一頁提早多久開始長：兩段疊在一起，中間不會空掉 */
const STILL_OVERLAP_MS = 300;
/** 黑洞的時間膨脹：飛行拉長幾倍（後段越飛越慢，見 geometry 的 escape） */
const BH_DILATE = 1.35;
/** 換主題之後接回這一頁（quiet）：點飛回錨點最少要多久、最多多久、沿著頁面的線走的速度（px/ms） */
const QUIET_MS = 650;
const QUIET_MAX_MS = 1800;
const QUIET_SPEED = 1.4;
/**
 * 黑洞的重力波（LIGO 2015 年第一次偵測到的，兩個黑洞合併）：點落地＝合併，從落點放出一道。
 * 只放這一道、淡淡的、走不遠：合併前越來越密的啁啾與之後的餘振試過，一圈接一圈看起來很抽象
 */
const WAVE_STRENGTH = 0.55;
/**
 * 參宿四的換頁：點一路甩出塵埃殼（它一直在往外拋物質，2019 年的大暗化就是其中一團冷卻成的塵埃）。
 * 每隔 SHELL_EVERY 毫秒甩一圈（殼怎麼擴、活多久見 paint）。點本身也在呼吸（變星）
 */
const SHELL_EVERY = 130;

/** 收、飛、長 */
export type Phase = PaintState['phase'];

/** 一趟轉場的運動狀態 */
export interface SceneRun extends PaintState {
  t0: number;
  from: Pt;
  /** 點在世界座標的位置（鏡頭還沒動之前跟畫面座標一樣） */
  pos: Pt;
  /** px/ms */
  vel: Pt;
  launchAt: number;
  last: number;
  /** 點飛過的路（世界座標，t 是畫下去的時間：彗尾照它散掉） */
  trail: Trail;
  /** 錨點（新的一頁在原位時的畫面座標） */
  to: Pt | null;
  growAt: number;
  /** 頁面給的那一點：這個時間之前（換頁之後也是）都跟著它 */
  followUntil: number;
  /** 新的一頁在世界裡挪了多少；鏡頭現在的位移（畫面 = 世界 − cam） */
  offset: Pt;
  cam: Pt;
  /** 海王星的彈弓繞過的那顆星（世界座標）；沒有彈弓是 null */
  focus: Pt | null;
  /** 點不用飛（已經在錨點上）：鏡頭不動 */
  still: boolean;
  /** 點現在畫在畫面上的哪裡、往哪裡動（px/ms）：轉場還沒跑完又換頁時，新的一趟從這裡接著飛 */
  screen: Pt;
  screenVel: Pt;
  trackAt: number;
  /** 這一趟是接著上一趟沒跑完的：點一開始就亮著 */
  carried: boolean;
  /** 這一頁其實沒換（換主題之後接回來）：不走頁面那段路、不重演它的進場 */
  quiet: boolean;
  /**
   * quiet 那一趟的尾巴記的是「走到路的哪裡」（沿著路的長度），不是畫面上的點：頁面的線會動（作品頁的航線、
   * 手記的星軌一直在轉），尾巴每一幀照現在的路重畫，才會一直貼在線上
   */
  quietS?: { s: number; t: number }[];
  /** 頁面現在的透明度（這一趟最後一次設的） */
  opacity: number;
}

/** 一趟怎麼開始：收的那一刻，或開場／換主題之後直接從飛開始 */
export interface SceneStart {
  phase: 'leave' | 'fly';
  t0: number;
  from: Pt;
  vel: Pt;
  followUntil: number;
  /** 上一趟沒散完的彗尾與塵埃（已經換成這一頁的畫面座標） */
  trail: Trail;
  dust: PaintState['dust'];
  carried: boolean;
  quiet: boolean;
}

/** 呼叫端讀好 DOM 之後，排路線要的東西 */
export interface PlanInput {
  /** 新的一頁的錨點（摺疊機的摺痕已經避開） */
  anchor: Pt;
  /** 新的一頁給的最後一段路（頁面的 arrive） */
  arrival: { approach?: Pt[]; still?: boolean; join?: number; tangent?: Pt; pace?: number } | null;
  w: number;
  h: number;
  /** 開場交棒給首頁的 3D 土星（環套在點上） */
  ring: boolean;
}

/** 每一幀呼叫端讀好送進來的 */
export interface FrameInput {
  w: number;
  h: number;
  /** 頁面給的那一點（頁面有給的話） */
  follow: Pt | null;
  /** quiet 那一趟：現在的路（從出發點接上頁面的線，或直接到錨點）與沿著線走的速度 */
  quiet: { route: Path; pace?: number } | null;
}

export interface SceneEffects {
  /** 點現在畫在畫面上的哪裡 */
  screen(p: Pt): void;
  /** 頁面該怎麼擺：transform（null 是不動它）與透明度 */
  page(transform: string | null, opacity: number): void;
  /** 鏡頭的位移（背景星空跟著挪） */
  camera(cam: Pt): void;
  /**
   * 路線排好了：頁面先藏起來，translate 是新的一頁在世界裡挪了多少（null 是不挪）。
   * flight 有的話，鏡頭照它走（geometry 的 flightAt）：呼叫端可以拿它把頁面的位移交給合成器（WAAPI）、
   * 星空的視差交給星空的 worker，主執行緒卡住時它們照樣走
   */
  planned(p: {
    translate: Pt | null;
    flight: { path: Flight; offset: Pt; w: number; h: number; blackhole: boolean } | null;
  }): void;
  /** 開始長：交棒給新的一頁。trail 是點飛過的路，換成新的一頁原位的座標 */
  grow(g: { from: Pt; to: Pt; trail: Pt[]; quiet: boolean }): void;
}

export function createScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  style: PaintStyle,
  fx: SceneEffects,
) {
  const { dot, dustShells, drawHole, gravityWaves, tail, slingBody, predicted, drawDust } = createPainter(ctx, style);
  let run: SceneRun | null = null;

  /** 記下點在畫面上的位置與速度 */
  const track = (r: SceneRun, p: Pt, now: number) => {
    const dt = now - r.trackAt;
    if (r.trackAt > 0 && dt > 0) r.screenVel = { x: (p.x - r.screen.x) / dt, y: (p.y - r.screen.y) / dt };
    r.screen = { ...p };
    r.trackAt = now;
    fx.screen(p);
  };

  /** 彗尾的塵埃：從點身上一路散出來，往後飄、慢慢熄 */
  const emitDust = (r: SceneRun, p: Pt, back: Pt, dt: number) => {
    const n = Math.min(6, Math.ceil(dt / 6));
    for (let k = 0; k < n; k++) {
      const side = (Math.random() - 0.5) * 2;
      r.dust.push({
        x: p.x + (Math.random() - 0.5) * 3,
        y: p.y + (Math.random() - 0.5) * 3,
        vx: back.x * (0.02 + Math.random() * 0.05) - back.y * side * 0.03,
        vy: back.y * (0.02 + Math.random() * 0.05) + back.x * side * 0.03,
        life: 0,
        size: 0.8 + Math.random() * 1.2,
      });
    }
  };

  const shed = (r: SceneRun, now: number) => {
    const lastShell = r.shells.at(-1);
    if (!lastShell || now - lastShell.at > SHELL_EVERY)
      r.shells.push({
        c: { ...r.pos },
        at: now,
        phase: Array.from({ length: 5 }, () => Math.random() * Math.PI * 2),
      });
  };

  return {
    get run() {
      return run;
    },

    begin(s: SceneStart) {
      run = {
        phase: s.phase,
        flight: null,
        waves: [],
        hole: null,
        shells: [],
        dust: s.dust,
        t0: s.t0,
        from: s.from,
        pos: s.from,
        vel: s.vel,
        launchAt: s.phase === 'fly' ? s.t0 : 0,
        last: s.phase === 'fly' ? s.t0 : 0,
        trail: s.trail,
        to: null,
        growAt: 0,
        followUntil: s.followUntil,
        offset: { x: 0, y: 0 },
        cam: { x: 0, y: 0 },
        focus: null,
        still: false,
        screen: { ...s.from },
        screenVel: { x: 0, y: 0 },
        trackAt: 0,
        carried: s.carried,
        quiet: s.quiet,
        opacity: 0,
      };
    },

    /** 收完了，放行換頁：點開始飛（新的一頁還沒報到，先順著原本的方向滑出去） */
    release(now: number) {
      if (!run) return;
      run.phase = 'fly';
      run.launchAt = run.last = now;
    },

    end() {
      run = null;
    },

    /**
     * 新的一頁報到了，排這一趟：
     *   對焦  鏡頭先移到點上，把它放到畫面正中間（點停在原地等鏡頭）
     *   跟拍  點出發，順著「頁面那條線」的方向直直飛，鏡頭跟著它、它一直在正中間
     *   煞停  快接上頁面的線時鏡頭慢慢停在新的一頁的原位；點不停，從畫面中間滑到那條線的起點，
     *         再順著那條線走完（沿著星軌、沿著彗尾…），落在錨點上
     * 跟拍那段在世界裡是一條直線，方向就是那條線起點的方向，所以接上去的那一下不會拐彎
     */
    plan({ anchor, arrival, w, h, ring }: PlanInput, now: number) {
      const r = run;
      if (!r) return;
      const mid = { x: w / 2, y: h / 2 };
      const approach = arrival?.approach && arrival.approach.length > 1 ? arrival.approach : null;
      const target = approach ? approach[0] : anchor;
      const gap = { x: target.x - r.pos.x, y: target.y - r.pos.y };
      r.to = approach ? (approach.at(-1) ?? anchor) : anchor;
      r.opacity = 0;
      // 點已經在錨點上了（手記的星軌直接被拉成文章的軌道）：不用飛，鏡頭不動，直接長
      // 開場交棒時環套在點上，差幾 px 跳過去也看得出來，要滑；只有真的對上才原地長
      const near = ring ? 1 : 6;
      r.still = Boolean(arrival?.still) || (!approach && len(gap) < near);
      if (r.still) {
        r.flight = {
          points: [r.to, r.to],
          cum: [0, 0],
          total: 1,
          at: now,
          dur: 1,
          acquire: 0,
          start: { ...r.pos },
          brakeFrom: 0,
          brakeTo: 0,
        };
        r.offset = { x: 0, y: 0 };
        r.cam = { x: 0, y: 0 };
        fx.planned({ translate: null, flight: null });
        return;
      }
      // 開場交棒給首頁的 3D 土星：點平常就在土星中心（index.css 的 --boot-cy），上面就原地長了。
      // 對不上的（摺疊機摺起來之類）差的只有幾十 px：點直直滑過去，環套在點上一起走，鏡頭不動。
      // 不走下面那套飛行：那套會先飛出去一大段再煞停回來，環被留在原地
      if (ring) {
        const d = len({ x: anchor.x - r.pos.x, y: anchor.y - r.pos.y });
        r.to = anchor;
        r.flight = {
          points: [{ ...r.pos }, anchor],
          cum: [0, d],
          total: Math.max(1, d),
          at: now,
          // 差幾 px 的不要也滑滿最短的那 0.7 秒：40px 以內照距離縮短
          dur: clamp(d / SPEED, FLY_MIN_MS * Math.min(1, d / 40), FLY_MAX_MS),
          acquire: 0,
          start: { ...r.pos },
          brakeFrom: 0,
          brakeTo: 0,
        };
        r.offset = { x: 0, y: 0 };
        r.cam = { x: 0, y: 0 };
        fx.planned({ translate: null, flight: null });
        return;
      }
      // 頁面那條線起點的方向：頁面指定的路的方向；沒指定就由畫面中心直直進去
      const fromMid = { x: target.x - mid.x, y: target.y - mid.y };
      const fallback = len(gap) > 40 ? unit(gap) : len(r.vel) > 0.01 ? unit(r.vel) : { x: 0, y: -1 };
      const inDir = approach
        ? unit({ x: approach[1].x - approach[0].x, y: approach[1].y - approach[0].y })
        : (arrival?.tangent ?? (len(fromMid) > 20 ? unit(fromMid) : fallback));
      // 鏡頭在 approach 的第 join 點停下（前面那段在畫面外，鏡頭跟著點沿著它走）
      const join = approach ? clamp(Math.round(arrival?.join ?? 0), 0, approach.length - 1) : 0;
      const stopAt = approach ? approach[join] : anchor;
      const toStop = { x: stopAt.x - mid.x, y: stopAt.y - mid.y };
      // 煞停要多長：點要從畫面中間滑到鏡頭停下的那一點，離得越遠煞得越久
      const brake = clamp(len(toStop) * 1.1 + 160, 200, Math.min(w, h));
      // 頁面給了畫面外的那段路，鏡頭就沿著它跟拍：起頭的直線只要短短一段，把點接上那條路
      const L = join > 0 ? Math.min(w, h) * 0.2 : Math.max(Math.min(w, h) * TRAVEL, brake + 220);
      const v0 = len(r.vel) > 0.05 ? unit(r.vel) : inDir;
      // 世界裡：從點現在的位置沿 inDir 直直飛 L，終點就是（挪過的）那條線的起點；起步稍微帶一點點原本的方向。
      // 海王星是重力彈弓（flyby）：沿雙曲線繞過一顆星，出去的方向接上那條線，終點由那條雙曲線決定
      const m0 = unit({ x: inDir.x + 0.3 * v0.x, y: inDir.y + 0.3 * v0.y });
      const sling =
        style.theme === 'neptune' ? flyby(r.pos, inDir, L, v0.x * inDir.y - v0.y * inDir.x >= 0 ? -1 : 1) : null;
      const end = sling ? (sling.points.at(-1) ?? r.pos) : { x: r.pos.x + inDir.x * L, y: r.pos.y + inDir.y * L };
      r.focus = sling?.focus ?? null;
      if (style.theme === 'blackhole') r.hole = { c: { ...r.pos }, at: now };
      const O = { x: end.x - target.x, y: end.y - target.y };
      const shift = (p: Pt): Pt => ({ x: p.x + O.x, y: p.y + O.y });
      const lead = sling
        ? sling.points
        : hermite(r.pos, { x: m0.x * L, y: m0.y * L }, end, { x: inDir.x * L, y: inDir.y * L }, 48);
      const points = [...lead, ...(approach ? approach.slice(1).map(shift) : [])];
      const cum = cumulative(points);
      const total = Math.max(1, cum.at(-1) ?? 1);
      const sJoin = cum[lead.length - 1 + join] ?? total;
      const pace = clamp(arrival?.pace ?? 1, 0.3, 2);
      const acquire = clamp(len({ x: r.pos.x - mid.x, y: r.pos.y - mid.y }) / 2.2, ACQUIRE_MIN_MS, ACQUIRE_MAX_MS);
      r.flight = {
        points,
        cum,
        total,
        at: now,
        dur:
          clamp(total / (SPEED * pace), FLY_MIN_MS, FLY_MAX_MS / pace) * (style.theme === 'blackhole' ? BH_DILATE : 1),
        acquire,
        start: { ...r.pos },
        brakeFrom: Math.max(0, sJoin - Math.min(brake, sJoin * 0.8)),
        brakeTo: sJoin,
      };
      r.offset = O;
      r.cam = { x: 0, y: 0 };
      // 新的一頁在飛的時候就看得到（跟著鏡頭進來），不再藏著
      fx.planned({
        translate: O,
        flight: { path: r.flight, offset: O, w, h, blackhole: style.theme === 'blackhole' },
      });
    },

    /** 畫這一幀。回傳 true 是這一趟跑完了（點暗下去、彗尾與塵埃都散完） */
    frame(now: number, io: FrameInput): boolean {
      const r = run;
      if (!r) return true;
      const follow = io.follow;

      // 收：頁面往那一點收，點在那裡亮起來
      if (r.phase === 'leave') {
        const k = r.carried ? 1 : easeOut(clamp((now - r.t0) / LEAVE_MS));
        const p = follow ?? r.from;
        track(r, p, now);
        // 接著上一趟的：上一趟的彗尾與塵埃照樣散完
        drawDust(r, Math.min(50, now - r.last), 1);
        tail(r.trail, now, r.hole?.c);
        r.last = now;
        dot(p, 1 + 2 * k, k);
        return false;
      }

      // 舊頁留下的線、彗尾、塵埃都在世界裡：照鏡頭位移畫
      const world = (paint: () => void) => {
        ctx.save();
        ctx.translate(-r.cam.x, -r.cam.y);
        paint();
        ctx.restore();
      };

      // 這一頁其實沒換（換主題之後接回來）：沒有鏡頭、頁面原地淡回來，點在畫面上直直飛向錨點。
      // 錨點每一幀重讀：會動的（作品頁的月亮、收藏頁轉著的地球上那一點）也追得上
      // 頁面給了 rejoin（那條線，終點是它現在的那一點）的話，點先飛到線的起點、再順著線走完
      if (r.phase === 'fly' && r.quiet && io.quiet) {
        const { route: path, pace } = io.quiet;
        const { points: route, cum } = path;
        const total = Math.max(1, cum.at(-1) ?? 1);
        const target = route.at(-1) ?? r.from;
        // 黑洞：一樣是逃出來的（起步被拖住、越逃越快），從新主星收成的那一點逃出來
        const ease = style.theme === 'blackhole' ? escape : (x: number) => smooth(0, 1, x);
        const prev = r.pos;
        let u: number;
        /** 走到路的哪裡（沿著路的長度） */
        let at: number;
        // 頁面淡回來的進度：兩拍的話在第一拍就淡完，滑下去時看得到那條線
        let shown: number;
        if (pace) {
          // 兩拍：先飛到線的起點，再用頁面給的速度沿著線走
          const reach = cum[1];
          const first = clamp(reach / QUIET_SPEED, QUIET_MS * 0.6, QUIET_MAX_MS);
          const second = clamp((total - reach) / pace, QUIET_MS * 0.6, QUIET_MAX_MS);
          const el = now - r.launchAt;
          u = clamp(el / (first + second));
          shown = clamp(el / first);
          at = el < first ? ease(el / first) * reach : reach + smooth(0, 1, (el - first) / second) * (total - reach);
        } else {
          // 路越長走越久（沿著線走一次要看得清楚），但有上限
          const dur =
            clamp(total / QUIET_SPEED, QUIET_MS, QUIET_MAX_MS) * (style.theme === 'blackhole' ? BH_DILATE : 1);
          u = clamp((now - r.launchAt) / dur);
          shown = u;
          at = ease(u) * total;
        }
        r.pos = pointAt(path, at);
        r.quietU = u;
        const dt = Math.min(50, now - r.last);
        const moved = { x: r.pos.x - prev.x, y: r.pos.y - prev.y };
        r.quietS ??= [];
        const lastS = r.quietS.at(-1);
        if (!lastS || Math.abs(at - lastS.s) > 1.5) r.quietS.push({ s: at, t: now });
        r.trail = r.quietS.map((q) => ({ ...pointAt(path, q.s), t: q.t }));
        r.opacity = smooth(0.3, 1, shown);
        fx.page(null, r.opacity);
        // 各主題自己的那一筆，跟一般換頁一樣：土星的彗尾塵埃、黑洞（光被拉回身後的小黑洞、麵條化、重力波）、
        // 參宿四一路拋出的塵埃殼、海王星的預言落點。沒有的只有海王星的彈弓：這一趟的路是頁面的線
        if (len(moved) > 0.2 && style.theme === 'saturn') emitDust(r, r.pos, unit({ x: -moved.x, y: -moved.y }), dt);
        if (style.theme === 'blackhole' && !r.hole) r.hole = { c: { ...r.from }, at: now };
        if (style.theme === 'betelgeuse' && len(moved) > 0.2) shed(r, now);
        let stretch: Stretch | undefined;
        if (style.theme === 'blackhole') {
          const k = u > 0 ? 1 - smooth(0.08, 0.5, u) : 0;
          if (k > 0 && len(moved) > 0.01) stretch = { k, angle: Math.atan2(moved.y, moved.x) };
        }
        world(() => {
          drawDust(r, dt, 1);
          tail(r.trail, now, r.hole?.c);
          drawHole(r, now);
          dustShells(r, now);
          gravityWaves(r, now);
          if (style.theme === 'neptune') predicted(target, 0.45 * smooth(0.3, 0.6, u), 1);
        });
        track(r, r.pos, now);
        dot(r.pos, 3, 1, stretch);
        r.last = now;
        if (u < 1) return false;
        r.to = target;
        r.followUntil = now + GROW_MS;
        r.phase = 'grow';
        r.growAt = now;
      }

      if (r.phase === 'fly') {
        const dt = Math.min(50, now - r.last);
        r.last = now;
        if (!r.flight) {
          if (follow && now < r.followUntil) r.pos = follow;
          else {
            // 新的一頁還沒報到：點順著原本的方向滑出去、慢慢減速，不停下來等
            r.pos = { x: r.pos.x + r.vel.x * dt, y: r.pos.y + r.vel.y * dt };
            const decay = Math.pow(0.96, dt / 16.7);
            r.vel = { x: r.vel.x * decay, y: r.vel.y * decay };
          }
        }
        const prev = r.pos;
        if (r.flight) {
          const f = r.flight;
          const mid = { x: io.w / 2, y: io.h / 2 };
          const el = now - f.at;
          let tau = 0;
          if (r.still) {
            // 點已經在錨點上：頁面的那一點還在動的話（手記的星軌被推成文章的軌道）跟著它，動完才長
            // follow 是 null：頁面沒給那一點，或已經過了 followUntil（呼叫端不再讀它）
            const following = follow !== null;
            if (following && now < r.followUntil) r.pos = follow;
            else r.pos = r.to ?? r.pos;
            if (!following || now >= r.followUntil - STILL_OVERLAP_MS) tau = 1;
          } else {
            // 對焦（點停在原地、鏡頭移過去）與跟拍（點沿著路走、鏡頭讓它一直在正中間），見 geometry 的 flightAt
            const at = flightAt(f, r.offset, mid, style.theme === 'blackhole', el);
            r.pos = at.pos;
            r.cam = at.cam;
            tau = at.tau;
          }
          if (!r.still && el >= f.acquire) {
            // 新的一頁 = 世界裡挪過的位置 − 鏡頭，鏡頭停下時剛好回到原位
            r.opacity = smooth(0.15, 0.55, tau);
            fx.page(
              `translate(${(r.offset.x - r.cam.x).toFixed(1)}px, ${(r.offset.y - r.cam.y).toFixed(1)}px)`,
              r.opacity,
            );
          }
          // 背景的星空跟著鏡頭挪一點：是鏡頭在動，不是頁面在滑
          fx.camera(r.cam);
          if (tau >= 1) {
            r.phase = 'grow';
            r.growAt = now;
          }
        }
        const moved = { x: r.pos.x - prev.x, y: r.pos.y - prev.y };
        const lastPt = r.trail.at(-1);
        if (!lastPt || len({ x: r.pos.x - lastPt.x, y: r.pos.y - lastPt.y }) > 1.5) r.trail.push({ ...r.pos, t: now });
        // 塵埃只有土星（彗尾）：海王星的尾巴是那四段弧，黑洞的是一道螺旋
        if (len(moved) > 0.2 && style.theme === 'saturn') emitDust(r, r.pos, unit({ x: -moved.x, y: -moved.y }), dt);
        world(() => {
          drawDust(r, dt, 1);
          tail(r.trail, now, r.hole?.c);
          drawHole(r, now);
          dustShells(r, now);
          gravityWaves(r, now);
          // 彈弓繞過的那顆星：點靠近時浮出來，繞過去之後淡掉
          if (r.focus) {
            const d = len({ x: r.pos.x - r.focus.x, y: r.pos.y - r.focus.y });
            const near = 1 - smooth(SLING_BODY_R * 4, SLING_BODY_R * 22, d);
            if (near > 0.01) slingBody(r.focus, near);
          }
          // 預言的落點：點這一趟最後會停的地方（路的終點，世界座標）；飛過三成之後慢慢浮出來
          const f = r.flight;
          const goal = f?.points.at(-1);
          if (style.theme === 'neptune' && f && goal && !r.still) {
            const progress = clamp((now - f.at - f.acquire) / f.dur);
            predicted(goal, 0.45 * smooth(0.3, 0.6, progress), 1);
          }
        });
        const onScreen = { x: r.pos.x - r.cam.x, y: r.pos.y - r.cam.y };
        track(r, onScreen, now);
        // 黑洞：剛逃出來的時候點被潮汐力沿著前進方向拉長（麵條化）、光暈變暗（重力紅移），離遠了才恢復
        let stretch: Stretch | undefined;
        if (style.theme === 'blackhole' && r.flight && !r.still) {
          const f = r.flight;
          const progress = clamp((now - f.at - f.acquire) / f.dur);
          const k = progress > 0 ? 1 - smooth(0.08, 0.5, progress) : 0;
          if (k > 0 && len(moved) > 0.01) stretch = { k, angle: Math.atan2(moved.y, moved.x) };
        }
        if (style.theme === 'betelgeuse' && r.flight && !r.still && len(moved) > 0.2) shed(r, now);
        dot(onScreen, 3, 1, stretch);
        if (r.phase === 'fly') return false;
      }

      // 長：新的一頁接手自己的進場；彗尾照樣散完，點慢慢暗下去，頁面自己的那一點在它底下亮起來
      const to = r.to ?? r.pos;
      if (r.growAt === now) {
        // 交給頁面的線換成新的一頁原位的座標
        const cam = r.cam;
        fx.grow({ from: r.from, to, trail: r.trail.map((p) => ({ x: p.x - cam.x, y: p.y - cam.y })), quiet: r.quiet });
      }
      const g = clamp((now - r.growAt) / GROW_MS);
      // 沒飛的（點本來就在錨點上）這時才淡入
      r.opacity = Math.max(r.opacity, easeOut(g));
      fx.page('', r.opacity);
      // 黑洞：點落地＝合併，從落點放出那一道（世界座標：這時鏡頭停在 offset）
      if (style.theme === 'blackhole' && !r.still && r.growAt === now)
        r.waves.push({ at: now, c: { x: to.x + r.cam.x, y: to.y + r.cam.y }, strength: WAVE_STRENGTH });
      // quiet：線還在動，尾巴跟著它（見 SceneRun 的 quietS）
      const quietS = r.quietS;
      if (quietS && io.quiet) {
        const path = io.quiet.route;
        r.trail = quietS.map((q) => ({ ...pointAt(path, q.s), t: q.t }));
      }
      ctx.save();
      ctx.translate(-r.cam.x, -r.cam.y);
      drawDust(r, Math.min(50, now - r.last), 1);
      const alive = tail(r.trail, now, r.hole?.c);
      drawHole(r, now);
      const shedding = dustShells(r, now);
      const rippling = gravityWaves(r, now);
      ctx.restore();
      r.last = now;
      const landed = follow && now < r.followUntil ? follow : to;
      track(r, landed, now);
      // 預言的落點：點落進去的那一下亮起來，再跟著點一起收掉
      if (style.theme === 'neptune' && !r.still)
        predicted(landed, (0.45 + 0.4 * Math.sin(Math.PI * clamp(g * 2))) * (1 - g), 1 - easeOut(g));
      dot(landed, 3 * (1 - easeOut(g)), 1 - g);
      return g >= 1 && !r.dust.length && !alive && !rippling && !shedding;
    },
  };
}

export type Scene = ReturnType<typeof createScene>;
