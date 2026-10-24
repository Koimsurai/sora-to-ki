// 朋友：這個站是中心的琥珀點，朋友是繞著它轉的星，各在自己的軌道上（about/friendsSky）。
// 朋友寫了新文章，就有一道訊號從他那顆星傳回中心，星旁邊是他最新一篇（後端從他的 RSS 抓）；
// 越久沒更新的星越暗。右邊是交換用的本站資料與申請表：在表單打名字，下一條空軌道上會出現一顆預覽星。
// 換頁進來時琥珀點落在中心，軌道從內往外一條接一條長出來；離開時軌道收回中心，點從中心飛走。
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { friendsQueryOptions } from '@/data/friendsData';
import { usePageTransition } from '@/hooks/usePageTransition';
import { after, isArriving } from '@/store/pageTransition';
import { createSky, drawDock, frameOf, FRESH_DAYS } from './friendsSky';
import './Friends.css';

const CONTACT = 'timo9378@gmail.com';
const SITE = { name: '宙と木', url: 'https://koimsurai.com', rss: 'https://koimsurai.com/rss.xml' };

/** 滑鼠離一顆星多近才算滑到它（CSS 像素） */
const NEAR_PX = 46;
/** 軌道全部長出來的時間（秒） */
const GROW_S = 1.6;
/** 收：軌道收回中心的時間（毫秒） */
const ERASE_MS = 480;
/** 收完時點離開的速度（px/ms） */
const LEAVE_SPEED = 0.7;
/** 對接插圖只是慢慢晃，30fps 就夠 */
const DOCK_FRAME_MS = 33;

const pad2 = (n: number) => String(n).padStart(2, '0');
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

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
    return live.map((f) => ({ ...f, when: dateOf(f.latest?.date, now) }));
  }, [live]);
  const sky = useMemo(() => createSky(friends.map((f) => ({ id: f.id, days: f.when?.days ?? null }))), [friends]);

  const [form, setForm] = useState({ name: '', url: '', rss: '', desc: '' });
  const [sent, setSent] = useState(false);
  const previewName = form.name.trim();
  const previewRef = useRef(previewName);
  previewRef.current = previewName;

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);
  const previewLabelRef = useRef<HTMLSpanElement>(null);
  const focusRef = useRef(-1);
  const clockRef = useRef(0);
  const leaveRef = useRef<number | null>(null);

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

  // 軌道
  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    let preview = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場的點還在飛：等它落在中心才開始長
      if (isArriving() || !visible) return;
      if (start < 0) start = now;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const time = reduce ? 0 : (now - start) / 1000;
      clockRef.current = time;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grow = reduce ? 1 : easeOut(Math.min(1, time / GROW_S));
      const erase = leaveRef.current === null ? 0 : easeIn(Math.min(1, (now - leaveRef.current) / ERASE_MS));
      const name = previewRef.current;
      preview = reduce ? (name ? 1 : 0) : preview + ((name ? 1 : 0) - preview) * Math.min(1, dt * 4);

      let near = focusRef.current;
      if (near < 0 && pointer && leaveRef.current === null) {
        const [px, py] = pointer;
        let best = NEAR_PX;
        sky.positions(w, h, time).forEach(([x, y], i) => {
          const d = Math.hypot(px - x, py - y);
          if (d < best) {
            best = d;
            near = i;
          }
        });
      }
      const placed = sky.draw(ctx, { w, h, t: time, grow, erase, near, preview });
      const { cx } = frameOf(w, h);
      placed.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        // 字放在星的外側：星在中心左邊，字往左長
        const right = p.x >= cx;
        const lw = el.offsetWidth;
        let lx = right ? p.x + 14 : p.x - 14 - lw;
        let ly = p.y - 12;
        lx = Math.max(8, Math.min(w - lw - 8, lx));
        ly = Math.max(8, Math.min(h - el.offsetHeight - 8, ly));
        el.classList.toggle('is-left', !right);
        el.classList.toggle('is-on', i === near);
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        el.style.opacity = String(p.appear * (near < 0 || i === near ? 1 : 0.5));
      });
      const pl = previewLabelRef.current;
      if (pl) {
        const [x, y] = sky.previewAt(w, h, time);
        pl.style.transform = `translate(${x - pl.offsetWidth / 2}px, ${y + 10}px)`;
        pl.style.opacity = String(preview * (1 - erase));
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

  // 對接插圖：兩艘船切開、慢慢靠近又退開，中間的點是 RSS 訊號
  useEffect(() => {
    const cv = dockRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const img = new Image();
    img.src = '/illustrations/docking.webp';
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
      drawDock(ctx, img, w, h, reduce ? 0 : (now - start) / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((s) => ({ ...s, [key]: e.target.value })),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const subject = `[Friend-link] ${form.name.trim()}`;
    const body = [`Name: ${form.name}`, `URL: ${form.url}`, `RSS: ${form.rss}`, `Intro: ${form.desc}`].join('\n');
    setSent(true);
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fr" ref={pageRef}>
      <header className="fr-head">
        <div className="fr-title">
          <h1>{t('friends.title')}</h1>
          <span className="fr-latin">Friends</span>
        </div>
        <p>{t('friends.subtitle')}</p>
      </header>

      <div className="fr-body">
        <div className="fr-sky" ref={boxRef}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <span className="fr-center">{SITE.name}</span>
          <ul className="fr-labels">
            {friends.map((f, i) => (
              <li
                key={f.id}
                className="fr-label"
                ref={(el) => {
                  labelsRef.current[i] = el;
                }}
              >
                <a
                  className="fr-name"
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onFocus={() => (focusRef.current = i)}
                  onBlur={() => (focusRef.current = -1)}
                >
                  {f.name}
                </a>
                <span className="fr-host">{hostOf(f.url)}</span>
                {f.latest ? (
                  <a
                    className="fr-latest"
                    href={f.latest.url ?? f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onFocus={() => (focusRef.current = i)}
                    onBlur={() => (focusRef.current = -1)}
                  >
                    {f.when && <time>{f.when.label}</time>}
                    <span>{f.latest.title}</span>
                  </a>
                ) : (
                  <span className="fr-latest is-quiet">{t(f.has_feed ? 'friends.noSignal' : 'friends.noFeed')}</span>
                )}
                <span className="fr-desc">{f.desc}</span>
              </li>
            ))}
          </ul>
          <span className="fr-preview" ref={previewLabelRef} aria-hidden="true">
            {previewName}
          </span>
          <ul className="fr-legend">
            <li>{t('friends.legendCenter')}</li>
            <li>{t('friends.legendSignal', { days: FRESH_DAYS })}</li>
            <li>{t('friends.legendDim')}</li>
          </ul>
        </div>

        {/* 窄螢幕：星旁邊只放得下名字，網址與最新一篇改列在軌道底下（寬螢幕不顯示，字已經在星旁邊） */}
        <ul className="fr-list">
          {friends.map((f) => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                <b>{f.name}</b>
                <span className="fr-host">{hostOf(f.url)}</span>
              </a>
              <span className="fr-list-desc">{f.desc}</span>
              {f.latest ? (
                <a className="fr-latest" href={f.latest.url ?? f.url} target="_blank" rel="noopener noreferrer">
                  {f.when && <time>{f.when.label}</time>}
                  <span>{f.latest.title}</span>
                </a>
              ) : (
                <span className="fr-latest is-quiet">{t(f.has_feed ? 'friends.noSignal' : 'friends.noFeed')}</span>
              )}
            </li>
          ))}
        </ul>

        <aside className="fr-side">
          <div className="fr-dock">
            <canvas ref={dockRef} aria-hidden="true" />
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

          <form className="fr-form" onSubmit={submit}>
            <h2>{t('friends.formTitle')}</h2>
            <label className="fr-input">
              <span>{t('friends.fieldName')}</span>
              <input
                type="text"
                maxLength={24}
                required
                autoComplete="off"
                placeholder={t('friends.fieldNameHint')}
                {...field('name')}
              />
            </label>
            <label className="fr-input">
              <span>{t('friends.fieldUrl')}</span>
              <input type="url" required autoComplete="off" placeholder="https://" {...field('url')} />
            </label>
            <label className="fr-input">
              <span>{t('friends.fieldRss')}</span>
              <input type="url" autoComplete="off" placeholder="https://" {...field('rss')} />
            </label>
            <label className="fr-input">
              <span>{t('friends.fieldDesc')}</span>
              <input type="text" maxLength={40} autoComplete="off" {...field('desc')} />
            </label>
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
