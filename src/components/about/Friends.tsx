// 朋友：這個站是中心的琥珀點，朋友是繞著它轉的星，各在自己的橢圓軌道上（about/friendsSky）。
// 朋友最近的每一篇是他軌道上的一個刻點（後端從他的 RSS 抓），滑過看標題、點了開文章；
// 點一顆星就跟他對接：鏡頭拉近、兩艘船接上，旁邊展開他最近的文章。
// 交換用的本站資料與申請表收在右邊的抽屜（跟頂欄的選單一樣：滑過把手停一下、或點它才拉出來），
// 拉出來時整個軌道系統往左讓位、不被蓋住；打名字時一顆預覽星從畫面外飛來等著，送出時抽屜收起、
// 預覽星點火切進空軌道。
// 換頁進來時琥珀點落在中心，軌道從內往外一條接一條長出來；離開時軌道收回中心，點從中心飛走。
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { friendsQueryOptions } from '@/data/friendsData';
import { usePageTransition } from '@/hooks/usePageTransition';
import { after, isArriving } from '@/store/pageTransition';
import {
  createSky,
  drawDockIllustration,
  frameOf,
  FRESH_DAYS,
  INSERT_S,
  type Drawn,
  type Inset,
  type Preview,
} from './friendsSky';
import './Friends.css';
import { sameTitle } from '@/lib/pageTitle';

const CONTACT = 'timo9378@gmail.com';
const SITE = { name: '宙と木', url: 'https://koimsurai.com', rss: 'https://koimsurai.com/rss.xml' };
const ART = '/illustrations/docking.webp';

/** 滑鼠離一顆星多近才算滑到它（CSS 像素） */
const NEAR_PX = 40;
/** 離一個刻點多近才算滑到它 */
const BEACON_PX = 9;
/** 軌道全部長出來的時間（秒） */
const GROW_S = 1.6;
/** 收：軌道收回中心的時間（毫秒） */
const ERASE_MS = 480;
/** 收完時點離開的速度（px/ms） */
const LEAVE_SPEED = 0.7;
/** 對接：鏡頭拉近、兩艘船接上各要幾秒；解除時倒著走 */
const ZOOM_S = 0.8;
const JOIN_S = 0.9;
/** 預覽星從畫面外飛到外圈要幾秒 */
const HOLD_S = 1.4;
/** 對接插圖只是慢慢晃，30fps 就夠 */
const DOCK_FRAME_MS = 33;
/** 抽屜：滑過把手停多久才拉出來、滑鼠離開多久才收（跟頂欄的選單同一組數字，layout/SiteNav） */
const OPEN_AFTER_MS = 280;
const CLOSE_AFTER_MS = 320;
/** 送出之後抽屜等多久收起（讓「收到了」那行先被看到一眼） */
const CLOSE_AFTER_SEND_MS = 600;
/** 軌道讓位的快慢（每秒往目標靠近的比例，指數趨近） */
const INSET_RATE = 6;
/** 星旁的字離星多遠（CSS 像素），與疊到時滑開的快慢（臨界阻尼彈簧的角頻率：從靜止起步、不過衝） */
const LABEL_GAP = 14;
const LABEL_SPRING = 9;
/** 跟 Friends.css 的斷點同一個：窄螢幕的抽屜從底下拉上來 */
const SHEET_QUERY = '(max-width: 760px)';
/** 窄螢幕的頂欄高度（index.css 的 ≤480 是 56px）：抽屜從底下拉起來時，軌道擠到頂欄與抽屜之間 */
const SHEET_TOP = 56;

const pad2 = (n: number) => String(n).padStart(2, '0');
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

type FieldKey = 'name' | 'url' | 'rss' | 'desc' | 'email';
type FieldError = 'required' | 'url' | 'email';
type FormErrors = Partial<Record<FieldKey, FieldError>>;
const FIELD_ORDER: FieldKey[] = ['name', 'url', 'rss', 'desc', 'email'];
const ERROR_TEXT: Record<FieldError, string> = {
  required: 'friends.errRequired',
  url: 'friends.errUrl',
  email: 'friends.errEmail',
};

/** 只擋明顯打錯的（後端規則一樣）：有 @、@ 後面有點、沒有空白 */
const isEmail = (s: string) => /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]+$/.test(s);

const isWebUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/** 申請表要填的：名字、網址（http/https）；RSS 選填，有填也要是網址 */
function checkForm(form: Record<FieldKey, string>): FormErrors {
  const found: FormErrors = {};
  if (!form.name.trim()) found.name = 'required';
  if (!form.url.trim()) found.url = 'required';
  else if (!isWebUrl(form.url.trim())) found.url = 'url';
  if (form.rss.trim() && !isWebUrl(form.rss.trim())) found.rss = 'url';
  if (form.email.trim() && !isEmail(form.email.trim())) found.email = 'email';
  return found;
}

/** feed 上的日期 → 距今幾天與顯示用的日期（今年的只寫月日） */
function dateOf(raw: string | null | undefined, now: number) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const md = `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  return {
    days: Math.max(0, (now - d.getTime()) / 86400000),
    label: d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}.${md}`,
  };
}

export default function Friends() {
  const { t } = useTranslation();
  const { data: live = [] } = useQuery(friendsQueryOptions);
  const friends = useMemo(() => {
    const now = Date.now();
    return live.map((f) => ({
      ...f,
      posts: f.posts.map((p) => ({ ...p, when: dateOf(p.date, now) })),
    }));
  }, [live]);
  const sky = useMemo(
    () =>
      createSky(
        friends.map((f) => ({
          id: f.id,
          days: f.posts.at(0)?.when?.days ?? null,
          // 沒有日期的那篇當成很久以前
          posts: f.posts.map((p) => p.when?.days ?? 365),
        })),
      ),
    [friends],
  );

  const [form, setForm] = useState<Record<FieldKey, string>>({ name: '', url: '', rss: '', desc: '', email: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const inputsRef = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  /** 送不出去的理由（後端回的，或網路錯誤） */
  const [failed, setFailed] = useState<string | null>(null);
  /** 隱藏欄位：真人看不到也不會填，填了的是機器人（後端假裝收到、不存） */
  const [trap, setTrap] = useState('');
  const [docked, setDocked] = useState<number | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const sideOpenRef = useRef(false);
  sideOpenRef.current = sideOpen;
  const sideRef = useRef<HTMLElement>(null);
  const intentRef = useRef(0);
  const closeTimerRef = useRef(0);
  /** 軌道現在讓了多少位（動畫中的值，畫布與中心點都用它） */
  const insetRef = useRef<Inset>({ right: 0, bottom: 0, top: 0 });
  /** 每塊星旁的字為了不疊在一起被推開了多少（動畫中的值） */
  const labelOffRef = useRef<number[]>([]);
  const labelVelRef = useRef<number[]>([]);
  const previewName = form.name.trim();
  const nameRef = useRef(previewName);
  nameRef.current = previewName;
  const sentRef = useRef(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sideArtRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const centerRef = useRef<HTMLSpanElement>(null);
  const previewLabelRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(-1);
  const leaveRef = useRef<number | null>(null);
  /** 對接的動畫狀態：d 從 0 走到 2（0–1 鏡頭拉近、1–2 兩艘船接上）；換一顆要先退回 0 */
  const dockRef = useRef({ i: -1, want: false, d: 0, pending: -1 });
  /** 上一幀畫在哪裡（滑鼠判斷用） */
  const drawnRef = useRef<Drawn | null>(null);
  const hoverRef = useRef<{ star: number; beacon: [number, number] | null }>({ star: -1, beacon: null });
  const friendsRef = useRef(friends);
  friendsRef.current = friends;

  const openSide = () => {
    window.clearTimeout(closeTimerRef.current);
    setSideOpen(true);
  };
  const closeSide = () => {
    window.clearTimeout(intentRef.current);
    window.clearTimeout(closeTimerRef.current);
    setSideOpen(false);
  };
  /** 滑鼠離開抽屜：等一下再收；正在輸入框裡打字就不收（打到一半抽屜跑掉最煩） */
  const leaveSide = () => {
    window.clearTimeout(intentRef.current);
    if (!sideOpenRef.current) return;
    closeTimerRef.current = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && sideRef.current?.contains(active)) return;
      setSideOpen(false);
    }, CLOSE_AFTER_MS);
  };

  const dock = (i: number) => {
    closeSide();
    const s = dockRef.current;
    if (s.want && s.i === i) return;
    if (s.d > 0 && s.i !== i) {
      s.pending = i;
      s.want = false;
    } else {
      s.i = i;
      s.want = true;
    }
    setDocked(i);
  };
  const undock = () => {
    const s = dockRef.current;
    if (!s.want && s.pending < 0) return;
    s.want = false;
    s.pending = -1;
    buttonsRef.current[s.i]?.focus({ preventScroll: true });
  };

  const center = () => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const { cx, cy } = frameOf(box.clientWidth, box.clientHeight, insetRef.current);
    return { x: r.left + cx, y: r.top + cy };
  };

  usePageTransition({
    // 錨點是中心那顆（這個站）：點落在這裡，軌道從它往外長
    anchor: center,
    leave: () => {
      const point = center();
      if (!point) return null;
      leaveRef.current = performance.now();
      pageRef.current?.classList.add('is-leaving');
      return {
        point,
        velocity: { x: 0.45 * LEAVE_SPEED, y: -0.9 * LEAVE_SPEED },
        follow: () => center() ?? point,
        done: after(ERASE_MS),
      };
    },
  });

  // Esc 收抽屜、解除對接
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeSide();
      undock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 軌道
  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const art = new Image();
    art.src = ART;
    let pointer: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
    };
    const onLeave = () => {
      pointer = null;
    };
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', onLeave);
    // 捲出畫面就不畫
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(box);
    let raf = 0;
    let last = 0;
    let start = -1;
    let skyT = 0;
    const pv = { mode: 'hold' as Preview['mode'], since: -1, alpha: 0 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場的點還在飛：等它落在中心才開始長
      if (isArriving() || !visible) return;
      if (start < 0) start = now;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const real = (now - start) / 1000;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 抽屜拉出來時軌道讓位：寬螢幕讓出右邊、手機讓出底下（抽屜本身的大小，transform 不影響 offset*）
      const side = sideRef.current;
      const sheet = window.matchMedia(SHEET_QUERY).matches;
      const goal: Inset =
        sideOpenRef.current && side
          ? sheet
            ? { right: 0, bottom: side.offsetHeight, top: SHEET_TOP }
            : { right: side.offsetWidth, bottom: 0, top: 0 }
          : { right: 0, bottom: 0, top: 0 };
      const ins = insetRef.current;
      const k = reduce ? 1 : Math.min(1, dt * INSET_RATE);
      for (const key of ['right', 'bottom', 'top'] as const) {
        ins[key] += (goal[key] - ins[key]) * k;
        if (Math.abs(goal[key] - ins[key]) < 0.5) ins[key] = goal[key];
      }
      // 讓出來之後剩下的寬度（星旁的字不要排進抽屜底下）
      const vw = w - ins.right;

      // 對接：先拉近再接上，解除時倒著走；換一顆要等退回 0 才換
      const ds = dockRef.current;
      if (reduce) ds.d = ds.want ? 2 : 0;
      else if (ds.want) ds.d = Math.min(2, ds.d + (ds.d < 1 ? dt / ZOOM_S : dt / JOIN_S));
      else ds.d = Math.max(0, ds.d - (ds.d > 1 ? dt / (JOIN_S * 0.6) : dt / (ZOOM_S * 0.8)));
      if (ds.d === 0 && ds.pending >= 0) {
        ds.i = ds.pending;
        ds.pending = -1;
        ds.want = true;
      }
      const zoom = easeInOut(clamp01(ds.d));
      const join = clamp01(ds.d - 1);
      panelRef.current?.classList.toggle('is-open', ds.want && ds.d > 1.6);
      // 對接時軌道停下來（相對靜止才接得上）
      if (!reduce) skyT += dt * (1 - zoom);

      const grow = reduce ? 1 : easeOut(Math.min(1, real / GROW_S));
      const erase = leaveRef.current === null ? 0 : easeIn(Math.min(1, (now - leaveRef.current) / ERASE_MS));

      // 預覽星：打了名字就從畫面外飛來等著；送出後點火入軌
      const name = nameRef.current;
      if (sentRef.current && pv.mode === 'hold') {
        pv.mode = 'insert';
        pv.since = real;
      }
      if (pv.mode === 'insert' && real - pv.since >= INSERT_S) pv.mode = 'orbit';
      if (pv.mode === 'hold') {
        if (name && pv.since < 0) pv.since = real;
        if (!name && pv.alpha < 0.02) pv.since = -1;
      }
      const want = name || pv.mode !== 'hold' ? 1 : 0;
      pv.alpha = reduce ? want : pv.alpha + (want - pv.alpha) * Math.min(1, dt * 4);
      const preview: Preview | null =
        pv.since < 0 && pv.mode === 'hold'
          ? null
          : {
              alpha: pv.alpha,
              mode: pv.mode,
              u: reduce ? 1 : clamp01((real - pv.since) / (pv.mode === 'insert' ? INSERT_S : HOLD_S)),
            };

      // 滑到哪一個刻點、哪一顆星（看上一幀畫的位置）；對接中只認那一位的刻點
      const prev = drawnRef.current;
      let star = focusRef.current;
      let beacon: [number, number] | null = null;
      const settled = ds.d === 0 || (ds.want && ds.d === 2);
      if (pointer && prev && leaveRef.current === null && settled) {
        const [px, py] = pointer;
        let best = BEACON_PX;
        for (const b of prev.beacons) {
          const d = Math.hypot(px - b.x, py - b.y);
          if (d < best && (ds.d === 0 || b.i === ds.i)) {
            best = d;
            beacon = [b.i, b.j];
          }
        }
        if (!beacon && star < 0 && ds.d === 0) {
          let bestStar = NEAR_PX;
          prev.stars.forEach((s, i) => {
            const d = Math.hypot(px - s.x, py - s.y);
            if (d < bestStar) {
              bestStar = d;
              star = i;
            }
          });
        }
      }
      hoverRef.current = { star, beacon };
      box.classList.toggle('is-pointing', beacon !== null || (star >= 0 && ds.d === 0));

      const drawn = sky.draw(ctx, {
        w,
        h,
        t: skyT,
        real: reduce ? 0 : real,
        grow,
        erase,
        near: star,
        beacon,
        dock: ds.d > 0 ? { i: ds.i, zoom, join } : null,
        preview,
        art,
        inset: { ...ins },
      });
      drawnRef.current = drawn;

      const { cx, cy, squash } = frameOf(w, h, ins);
      // 星旁的字往「遠離中心」的方向長，錨點跟著星繞中心的角度連續地變（同首頁衛星的字，home/HomeOrbit）：
      // 在右邊從星的右側開始、在左邊結束在星的左側、在正上方正下方置中——星怎麼走字就怎麼跟，
      // 不會在走過中線的那一幀整塊翻到另一邊。兩塊字疊在一起時，後放的那塊滑到上面或下面（也是滑過去，不是跳）
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      drawn.stars.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        const dx = p.x - cx;
        // 軌道是壓扁的橢圓：角度要在攤平之後量，不然星在上下方時一點點橫移就換邊
        const dy = (p.y - cy) / squash;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        /** 字有幾成落在星的左邊：0 是整塊在右、1 是整塊在左 */
        const fx = 0.5 - 0.5 * ux;
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        let lx = p.x + ux * LABEL_GAP - lw * fx;
        // 在旁邊時第一行（名字）對齊星；往正下方轉時整塊移到星的下面、往正上方轉時移到上面
        const side = p.y - 12;
        let ly = uy >= 0 ? side + (p.y + LABEL_GAP - side) * uy : side + (p.y - LABEL_GAP - lh - side) * -uy;
        lx = Math.max(8, Math.min(vw - lw - 8, lx));
        let pushed = ly;
        for (const o of taken) {
          if (lx < o.x + o.w && lx + lw > o.x && pushed < o.y + o.h && pushed + lh > o.y) {
            const below = o.y + o.h + 6;
            const above = o.y - lh - 6;
            pushed = Math.abs(below - pushed) < Math.abs(above - pushed) && below + lh < h - 8 ? below : above;
          }
        }
        // 推開的量用彈簧追：直接指數趨近的話第一幀就衝最快，看起來還是「跳」了一下
        const goalOff = pushed - ly;
        let off = labelOffRef.current[i] ?? goalOff;
        let vel = labelVelRef.current[i] ?? 0;
        if (reduce) {
          off = goalOff;
          vel = 0;
        } else {
          vel += (LABEL_SPRING ** 2 * (goalOff - off) - 2 * LABEL_SPRING * vel) * dt;
          off += vel * dt;
        }
        labelOffRef.current[i] = off;
        labelVelRef.current[i] = vel;
        ly = Math.max(8, Math.min(h - lh - 8, ly + off));
        taken.push({ x: lx, y: pushed, w: lw, h: lh });
        el.classList.toggle('is-on', i === star);
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        // 每一行也照同一個比例對齊（在右邊靠左、在左邊靠右、在上下方置中），一樣是連續變的
        for (const line of el.children) {
          if (line instanceof HTMLElement && !line.classList.contains('fr-desc')) {
            line.style.translate = `${((lw - line.offsetWidth) * fx).toFixed(1)}px 0`;
          }
        }
        // 名字上方那行介紹不算在字塊的寬度裡（浮著、最寬 300px）：照同一個比例對齊，
        // 伸出天空左右邊的部分推回來
        const desc = el.querySelector<HTMLElement>('.fr-desc');
        if (desc) {
          const dw = desc.offsetWidth;
          const at = (lw - dw) * fx;
          const shift = Math.min(0, vw - 8 - (lx + at + dw)) + Math.max(0, 8 - (lx + at));
          desc.style.translate = `${(at + shift).toFixed(1)}px 0`;
        }
        el.style.opacity = String(p.appear * (star < 0 || i === star ? 1 : 0.5) * (1 - zoom));
        el.style.visibility = zoom > 0.95 ? 'hidden' : '';
      });
      // 中心的站名跟著軌道系統走（抽屜拉出來時軌道讓位，它也要跟著讓）
      if (centerRef.current) centerRef.current.style.translate = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
      if (centerRef.current) centerRef.current.style.opacity = String((1 - zoom) * (1 - erase));

      const pl = previewLabelRef.current;
      if (pl) {
        if (drawn.preview) {
          pl.style.transform = `translate(${drawn.preview.x - pl.offsetWidth / 2}px, ${drawn.preview.y + 10}px)`;
          pl.style.opacity = String(drawn.preview.alpha);
        } else pl.style.opacity = '0';
      }

      // 刻點的標題
      const tip = tipRef.current;
      if (tip) {
        const b = beacon && drawn.beacons.find((x) => x.i === beacon[0] && x.j === beacon[1]);
        const post = b ? friendsRef.current[b.i]?.posts[b.j] : null;
        if (b && post) {
          const key = `${b.i}:${b.j}`;
          if (tip.dataset.key !== key) {
            tip.dataset.key = key;
            const time = tip.querySelector('time');
            const title = tip.querySelector('span');
            if (time) time.textContent = post.when?.label ?? '';
            if (title) title.textContent = post.title;
          }
          const tw = tip.offsetWidth;
          const tx = Math.max(8, Math.min(w - tw - 8, b.x - tw / 2));
          const ty = b.y - tip.offsetHeight - 12;
          tip.style.transform = `translate(${tx}px, ${ty < 8 ? b.y + 14 : ty}px)`;
          tip.style.opacity = '1';
        } else tip.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, [sky]);

  // 右欄的對接插圖：兩艘船慢慢靠近又退開，中間的點是 RSS 訊號
  useEffect(() => {
    const cv = sideArtRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const img = new Image();
    img.src = ART;
    let raf = 0;
    let last = 0;
    let start = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (start < 0) start = now;
      // 抽屜收著就看不到，不畫
      if (!sideOpenRef.current || now - last < DOCK_FRAME_MS) return;
      last = now;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawDockIllustration(ctx, img, w, h, reduce ? 0 : (now - start) / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 對接的面板一打開就把焦點移過去
  useEffect(() => {
    if (docked === null) return;
    const id = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), (ZOOM_S + JOIN_S) * 1000);
    return () => window.clearTimeout(id);
  }, [docked]);

  // 點畫布：抽屜開著就先收抽屜；刻點開文章、星對接、空的地方解除對接
  const onSkyClick = (e: MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (sideOpenRef.current) {
      closeSide();
      return;
    }
    const { star, beacon } = hoverRef.current;
    if (beacon) {
      const f = friends.at(beacon[0]);
      const post = f?.posts.at(beacon[1]);
      if (f && post) window.open(post.url ?? f.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (star >= 0 && dockRef.current.d === 0) dock(star);
    else undock();
  };

  // 表單自己驗證（noValidate）：瀏覽器原生的提示框跟這個站的樣子不搭，錯誤改寫在欄位底下
  const fieldRow = (key: FieldKey, label: string, props: InputHTMLAttributes<HTMLInputElement>) => {
    const err = errors[key];
    return (
      <label className="fr-input">
        <span>{label}</span>
        <input
          {...props}
          ref={(el) => {
            inputsRef.current[key] = el;
          }}
          autoComplete="off"
          value={form[key]}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `fr-err-${key}` : undefined}
          onChange={(e) => {
            const value = e.target.value;
            setForm((s) => ({ ...s, [key]: value }));
            if (err) setErrors((s) => ({ ...s, [key]: undefined }));
          }}
        />
        {err && (
          <em className="fr-error" id={`fr-err-${key}`}>
            {t(ERROR_TEXT[err])}
          </em>
        )}
      </label>
    );
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = checkForm(form);
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      inputsRef.current[first]?.focus();
      return;
    }
    if (sending) return;
    setSending(true);
    setFailed(null);
    void (async () => {
      try {
        const res = await fetch('/api/friends/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            url: form.url,
            feed_url: form.rss,
            description: form.desc,
            email: form.email,
            website: trap,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setFailed(body.error ?? String(res.status));
          return;
        }
        sentRef.current = true;
        setSent(true);
        // 抽屜收起來，讓預覽星點火入軌那一段在整片天上播
        window.setTimeout(closeSide, CLOSE_AFTER_SEND_MS);
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    })();
  };

  const open = docked === null ? null : friends[docked];

  return (
    <div className={sideOpen ? 'fr is-side-open' : 'fr'} ref={pageRef}>
      <header className="fr-head">
        <div className="fr-title">
          <h1>{t('friends.title')}</h1>
          {!sameTitle(t('friends.title'), 'Friends') && <span className="fr-latin">Friends</span>}
        </div>
        <p>{t('friends.subtitle')}</p>
      </header>

      <div className="fr-body">
        <div className="fr-sky" ref={boxRef}>
          <canvas ref={canvasRef} aria-hidden="true" onClick={onSkyClick} />
          <span className="fr-center" ref={centerRef}>
            {SITE.name}
          </span>
          <ul className="fr-labels">
            {friends.map((f, i) => {
              const latest = f.posts.at(0);
              return (
                <li
                  key={f.id}
                  className="fr-label"
                  ref={(el) => {
                    labelsRef.current[i] = el;
                  }}
                >
                  <button
                    type="button"
                    className="fr-name"
                    aria-label={t('friends.dockWith', { name: f.name })}
                    ref={(el) => {
                      buttonsRef.current[i] = el;
                    }}
                    onClick={() => dock(i)}
                    onFocus={() => (focusRef.current = i)}
                    onBlur={() => (focusRef.current = -1)}
                  >
                    {f.name}
                  </button>
                  <span className="fr-host">{hostOf(f.url)}</span>
                  {latest ? (
                    <a
                      className="fr-latest"
                      href={latest.url ?? f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onFocus={() => (focusRef.current = i)}
                      onBlur={() => (focusRef.current = -1)}
                    >
                      {latest.when && <time>{latest.when.label}</time>}
                      <span>{latest.title}</span>
                    </a>
                  ) : (
                    <span className="fr-latest is-quiet">{t(f.has_feed ? 'friends.noSignal' : 'friends.noFeed')}</span>
                  )}
                  <span className="fr-desc">{f.desc}</span>
                </li>
              );
            })}
          </ul>
          <span className="fr-preview" ref={previewLabelRef} aria-hidden="true">
            {previewName}
          </span>
          <div className="fr-tip" ref={tipRef} aria-hidden="true">
            <time />
            <span />
          </div>

          {/* 對接之後展開的面板：他是誰、最近的文章 */}
          <section
            className="fr-panel"
            ref={panelRef}
            tabIndex={-1}
            aria-label={open ? t('friends.dockWith', { name: open.name }) : undefined}
          >
            {open && (
              <>
                <span className="fr-panel-tag">{t('friends.docked')}</span>
                <a className="fr-panel-name" href={open.url} target="_blank" rel="noopener noreferrer">
                  {open.name}
                  <span className="fr-host">{hostOf(open.url)}</span>
                </a>
                <p className="fr-panel-desc">{open.desc}</p>
                <h2>{t('friends.recent')}</h2>
                {open.posts.length ? (
                  <ol className="fr-panel-posts">
                    {open.posts.map((p) => (
                      <li key={`${p.title}-${p.date ?? ''}`}>
                        <a href={p.url ?? open.url} target="_blank" rel="noopener noreferrer">
                          <time>{p.when?.label ?? ''}</time>
                          <span>{p.title}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="fr-panel-desc">{t(open.has_feed ? 'friends.noSignal' : 'friends.noFeed')}</p>
                )}
                <div className="fr-panel-actions">
                  <a href={open.url} target="_blank" rel="noopener noreferrer">
                    {t('friends.visit')}
                  </a>
                  <button type="button" onClick={undock}>
                    {t('friends.undock')}
                  </button>
                </div>
              </>
            )}
          </section>

          <ul className="fr-legend">
            <li>{t('friends.legendCenter')}</li>
            <li>{t('friends.legendBeacon')}</li>
            <li>{t('friends.legendSignal', { days: FRESH_DAYS })}</li>
            <li>{t('friends.legendDim')}</li>
            <li>{t('friends.legendDock')}</li>
          </ul>
        </div>

        {/* 窄螢幕：星旁邊只放得下名字，網址與最近的文章改列在軌道底下（寬螢幕不顯示，字已經在星旁邊） */}
        <ul className="fr-list">
          {friends.map((f) => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                <b>{f.name}</b>
                <span className="fr-host">{hostOf(f.url)}</span>
              </a>
              <span className="fr-list-desc">{f.desc}</span>
              {f.posts.length ? (
                f.posts.slice(0, 3).map((p) => (
                  <a
                    key={`${p.title}-${p.date ?? ''}`}
                    className="fr-latest"
                    href={p.url ?? f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.when && <time>{p.when.label}</time>}
                    <span>{p.title}</span>
                  </a>
                ))
              ) : (
                <span className="fr-latest is-quiet">{t(f.has_feed ? 'friends.noSignal' : 'friends.noFeed')}</span>
              )}
            </li>
          ))}
        </ul>

        <aside
          className={sideOpen ? 'fr-side is-open' : 'fr-side'}
          ref={sideRef}
          onPointerEnter={() => window.clearTimeout(closeTimerRef.current)}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') leaveSide();
          }}
        >
          {/* 把手：滑鼠停一下才拉出來（掃過去不算），觸控與鍵盤用點的 */}
          <button
            type="button"
            className="fr-handle"
            aria-expanded={sideOpen}
            aria-controls="fr-side-body"
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse' || sideOpenRef.current) return;
              intentRef.current = window.setTimeout(openSide, OPEN_AFTER_MS);
            }}
            onPointerLeave={() => window.clearTimeout(intentRef.current)}
            onClick={() => (sideOpenRef.current ? closeSide() : openSide())}
          >
            <i aria-hidden="true" />
            {t('friends.drawer')}
          </button>
          <div className="fr-side-body" id="fr-side-body" inert={!sideOpen}>
            <div className="fr-dock">
              <canvas ref={sideArtRef} aria-hidden="true" />
              <span className="sr-only">{t('friends.dockLabel')}</span>
            </div>

            <section className="fr-card" aria-labelledby="fr-card-title">
              <h2 id="fr-card-title">{t('friends.cardTitle')}</h2>
              <b>{SITE.name}</b>
              <dl>
                <div>
                  <dt>URL</dt>
                  <dd>{SITE.url}</dd>
                </div>
                <div>
                  <dt>DESC</dt>
                  <dd>{t('friends.siteDesc')}</dd>
                </div>
                <div>
                  <dt>RSS</dt>
                  <dd>{SITE.rss}</dd>
                </div>
                <div>
                  <dt>ICON</dt>
                  <dd>{`${SITE.url}/favicon.svg`}</dd>
                </div>
              </dl>
            </section>

            <form className="fr-form" onSubmit={submit} noValidate>
              <h2>{t('friends.formTitle')}</h2>
              {fieldRow('name', t('friends.fieldName'), {
                type: 'text',
                maxLength: 24,
                required: true,
                placeholder: t('friends.fieldNameHint'),
              })}
              {fieldRow('url', t('friends.fieldUrl'), { type: 'url', required: true, placeholder: 'https://' })}
              {fieldRow('rss', t('friends.fieldRss'), { type: 'url', placeholder: 'https://' })}
              {fieldRow('desc', t('friends.fieldDesc'), { type: 'text', maxLength: 40 })}
              {fieldRow('email', t('friends.fieldEmail'), {
                type: 'email',
                maxLength: 120,
                placeholder: t('friends.fieldEmailHint'),
              })}
              {/* 給機器人填的：畫面外、Tab 走不到、讀屏器也略過 */}
              <input
                className="fr-trap"
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
              <button type="submit" className="fr-submit" disabled={sending || sent}>
                {sending ? t('friends.sending') : t('friends.submit')}
              </button>
              {sent && <output className="fr-sent">{t('friends.sent')}</output>}
              {failed && (
                <output className="fr-sent fr-failed">
                  {t('friends.sendFailed', { reason: failed })} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
                </output>
              )}
            </form>

            <section className="fr-rules" aria-labelledby="fr-rules-title">
              <h2 id="fr-rules-title">{t('friends.rulesTitle')}</h2>
              <ol>
                <li>{t('friends.rule1')}</li>
                <li>{t('friends.rule2')}</li>
                <li>{t('friends.rule3')}</li>
                <li>{t('friends.rule4')}</li>
              </ol>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
