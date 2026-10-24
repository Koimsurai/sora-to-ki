// 朋友：這個站是中心的琥珀點，朋友是繞著它轉的星，各在自己的橢圓軌道上（about/friendsSky）。
// 朋友最近的每一篇是他軌道上的一個刻點（後端從他的 RSS 抓），滑過看標題、點了開文章；
// 點一顆星就跟他對接：鏡頭拉近、兩艘船接上，旁邊展開他最近的文章。
// 右邊是交換用的本站資料與申請表：打名字時一顆預覽星從畫面外飛來等著，送出時點火切進空軌道。
// 換頁進來時琥珀點落在中心，軌道從內往外一條接一條長出來；離開時軌道收回中心，點從中心飛走。
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { friendsQueryOptions } from '@/data/friendsData';
import { usePageTransition } from '@/hooks/usePageTransition';
import { after, isArriving } from '@/store/pageTransition';
import { createSky, drawDockIllustration, frameOf, FRESH_DAYS, INSERT_S, type Drawn, type Preview } from './friendsSky';
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

const pad2 = (n: number) => String(n).padStart(2, '0');
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

type FieldKey = 'name' | 'url' | 'rss' | 'desc';
type FormErrors = Partial<Record<FieldKey, 'required' | 'url'>>;
const FIELD_ORDER: FieldKey[] = ['name', 'url', 'rss', 'desc'];

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

  const [form, setForm] = useState<Record<FieldKey, string>>({ name: '', url: '', rss: '', desc: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const inputsRef = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});
  const [sent, setSent] = useState(false);
  const [docked, setDocked] = useState<number | null>(null);
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

  const dock = (i: number) => {
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
    const { cx, cy } = frameOf(box.clientWidth, box.clientHeight);
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

  // Esc 解除對接
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') undock();
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
      });
      drawnRef.current = drawn;

      const { cx } = frameOf(w, h);
      // 已經放好的字（兩顆星靠近時，後放的那塊讓到上面或下面）
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      drawn.stars.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        // 字放在星的外側：星在中心左邊，字往左長
        const right = p.x >= cx;
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        let lx = right ? p.x + 14 : p.x - 14 - lw;
        let ly = p.y - 12;
        lx = Math.max(8, Math.min(w - lw - 8, lx));
        for (const o of taken) {
          if (lx < o.x + o.w && lx + lw > o.x && ly < o.y + o.h && ly + lh > o.y) {
            const below = o.y + o.h + 6;
            const above = o.y - lh - 6;
            ly = Math.abs(below - ly) < Math.abs(above - ly) && below + lh < h - 8 ? below : above;
          }
        }
        ly = Math.max(8, Math.min(h - lh - 8, ly));
        taken.push({ x: lx, y: ly, w: lw, h: lh });
        el.classList.toggle('is-left', !right);
        el.classList.toggle('is-on', i === star);
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        el.style.opacity = String(p.appear * (star < 0 || i === star ? 1 : 0.5) * (1 - zoom));
        el.style.visibility = zoom > 0.95 ? 'hidden' : '';
      });
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
      if (now - last < DOCK_FRAME_MS) return;
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

  // 點畫布：刻點開文章、星對接、空的地方解除對接
  const onSkyClick = (e: MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
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
            {t(err === 'required' ? 'friends.errRequired' : 'friends.errUrl')}
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
    const subject = `[Friend-link] ${form.name.trim()}`;
    const body = [`Name: ${form.name}`, `URL: ${form.url}`, `RSS: ${form.rss}`, `Intro: ${form.desc}`].join('\n');
    sentRef.current = true;
    setSent(true);
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const open = docked === null ? null : friends[docked];

  return (
    <div className="fr" ref={pageRef}>
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

        <aside className="fr-side">
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
            <button type="submit" className="fr-submit">
              {t('friends.submit')}
            </button>
            {sent && (
              <output className="fr-sent">
                {t('friends.sent')} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
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
        </aside>
      </div>
    </div>
  );
}
