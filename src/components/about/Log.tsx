// 航行日誌：把原本的「歷史」與「動態」合成一頁（/history；/activity 轉到這裡）。
// 上面是一條往上爬的軌跡（about/logSky）：高度是從站點誕生起累積的 GitHub 貢獻，改版是軌跡上的點，
// 最前端是「現在」；正下方是同一條時間軸的熱力圖。右上角是任務經過時間（MET），
// 底下接著現在的狀態：今天寫了多久程式、這週的語言、最近在玩什麼。
// 換頁進來時琥珀點落在起點（發射台），火箭沿著軌跡一路爬到現在；離開時火箭沿最後的方向飛走，點跟著它。
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  codingNowQueryOptions,
  contributionsSinceQueryOptions,
  LOG_START,
  playingNowQueryOptions,
} from '@/data/logData';
import { MILESTONES, SITE_BIRTH } from '@/data/milestones';
import { usePageTransition } from '@/hooks/usePageTransition';
import { lookupOr } from '@/lib/tableLookup';
import { after, isArriving } from '@/store/pageTransition';
import { createLog, ROCKET_SRC } from './logSky';
import './Log.css';

/** 火箭從發射台爬到現在要幾秒 */
const CLIMB_S = 2.4;
/** 收：火箭飛走、其他淡掉的時間（毫秒，要在轉場等頁面收尾的 0.8 秒內） */
const ERASE_MS = 600;
/** 收完時點跟著火箭飛走的速度（px/ms） */
const LEAVE_SPEED = 0.9;
/** 比這窄就不標大轉折的名字（放不下） */
const NARROW_PX = 600;

const pad2 = (n: number) => String(n).padStart(2, '0');
const dotDate = (d: string) => d.replaceAll('-', '.');
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeIn = (t: number) => t * t;

export default function Log() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const { data: days = null } = useQuery(contributionsSinceQueryOptions);
  const { data: coding = null } = useQuery(codingNowQueryOptions);
  const { data: playing = null } = useQuery(playingNowQueryOptions);

  const milestones = useMemo(
    () =>
      MILESTONES.map((m, i) => ({
        ...m,
        key: `${m.date}-${i}`,
        label: lookupOr(m.text, lang, m.text['zh-TW']),
      })),
    [lang],
  );
  // 沒有貢獻資料（後端拿不到）時軌跡是平的：一樣畫得出時間軸與里程碑
  const log = useMemo(() => {
    const counts = days?.map((d) => d.count) ?? fallbackDays();
    return createLog(
      LOG_START,
      counts,
      MILESTONES.map((m) => m.date),
    );
  }, [days]);
  const dayDates = useMemo(() => days?.map((d) => d.date) ?? [], [days]);

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metRef = useRef<HTMLElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);
  const hudRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<number | null>(null);
  const eraseRef = useRef(0);
  /** 鏡頭跟著滑鼠轉的量（-1–1，平滑過的） */
  const lookRef = useRef(0);
  const textRef = useRef({ milestones, dayDates, contrib: (n: number) => t('log.contrib', { count: n }) });
  textRef.current = { milestones, dayDates, contrib: (n: number) => t('log.contrib', { count: n }) };

  const box = () => {
    const el = boxRef.current;
    return el ? { r: el.getBoundingClientRect(), w: el.clientWidth, h: el.clientHeight } : null;
  };

  usePageTransition({
    // 錨點是發射台：點從正上方落在這裡，火箭從這裡垂直離地
    anchor: () => {
      const b = box();
      const p = b && log.pad(b.w, b.h);
      return b && p ? { x: b.r.left + p.x, y: b.r.top + p.y } : null;
    },
    arrive: () => ({ tangent: { x: 0, y: 1 } }),
    leave: () => {
      const b = box();
      const start = b && log.rocketNose(b.w, b.h, lookRef.current, 0);
      if (!b || !start) return null;
      leaveRef.current = performance.now();
      pageRef.current?.classList.add('is-leaving');
      const nose = () => {
        const now = box() ?? b;
        const p = log.rocketNose(now.w, now.h, lookRef.current, eraseRef.current) ?? start;
        return { x: now.r.left + p.x, y: now.r.top + p.y };
      };
      return {
        point: nose(),
        velocity: { x: Math.cos(start.angle) * LEAVE_SPEED, y: Math.sin(start.angle) * LEAVE_SPEED },
        follow: nose,
        done: after(ERASE_MS),
      };
    },
  });

  // 任務經過時間：每秒跳一次，直接寫字，不經過 React
  useEffect(() => {
    const birth = new Date(SITE_BIRTH).getTime();
    const tick = () => {
      const d = Date.now() - birth;
      const hms = `${pad2(Math.floor(d / 3.6e6) % 24)}:${pad2(Math.floor(d / 6e4) % 60)}:${pad2(Math.floor(d / 1e3) % 60)}`;
      if (metRef.current) metRef.current.textContent = t('log.metValue', { days: Math.floor(d / 864e5), hms });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [t]);

  // 軌跡
  useEffect(() => {
    const el = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!el || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rocket = new Image();
    rocket.src = ROCKET_SRC;
    let pointer: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
    };
    // 觸控：點一下就停在那裡（手指離開時不清掉，提示才看得到）
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') pointer = null;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onMove);
    el.addEventListener('pointerleave', onLeave);
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    let raf = 0;
    let last = 0;
    let start = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (isArriving() || !visible) return;
      if (start < 0) start = now;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const real = (now - start) / 1000;
      const grow = reduce ? 1 : easeInOut(Math.min(1, real / CLIMB_S));
      const erase = leaveRef.current === null ? 0 : easeIn(Math.min(1, (now - leaveRef.current) / ERASE_MS));
      eraseRef.current = erase;
      // 鏡頭跟著滑鼠的水平位置轉一點點（平滑地跟）
      const want = pointer && !reduce ? (pointer[0] / w) * 2 - 1 : 0;
      lookRef.current += (want - lookRef.current) * Math.min(1, dt * 2);
      const look = lookRef.current;
      const hit =
        pointer && grow >= 1 && leaveRef.current === null ? log.hit(w, h, look, pointer[0], pointer[1]) : null;
      const drawn = log.draw(ctx, {
        w,
        h,
        t: reduce ? 0 : real,
        dt: reduce ? 0 : dt,
        grow,
        erase,
        look,
        milestone: hit?.milestone ?? -1,
        day: hit?.day ?? -1,
        rocket,
      });

      // 字跟著軌跡：大轉折的名字在點的上方左右交錯（下方是地上的刻度），火箭飛過去才出現；靠太近的往上讓開
      const at = log.milestonesAt(w, h, look);
      let flip = false;
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      const { milestones: ms, dayDates: dates, contrib } = textRef.current;
      ms.forEach((m, k) => {
        if (m.level !== 2) return;
        const label = labelsRef.current[k];
        const p = at[k];
        if (!label || !p) return;
        const lw = label.offsetWidth;
        const lh = label.offsetHeight;
        const x = flip ? p.x + 8 : p.x - 8 - lw;
        let y = p.y - 8 - lh;
        flip = !flip;
        for (const o of taken) {
          if (x < o.x + o.w && x + lw > o.x && y < o.y + o.h && y + lh > o.y) y = o.y - lh - 2;
        }
        taken.push({ x, y, w: lw, h: lh });
        label.style.transform = `translate(${Math.max(0, x)}px, ${y}px)`;
        // 窄螢幕放不下名字：只留點，點一下看提示（完整清單另外給報讀器）
        label.style.opacity = String((w >= NARROW_PX && log.milestoneIndex[k] <= drawn.tip ? 1 : 0) * (1 - erase));
      });
      // 火箭旁邊的遙測讀數：高度（累積貢獻）與飛了幾天，跟著火箭爬
      const here = drawn.now;
      if (hudRef.current && here) {
        const alt = hudRef.current.querySelector('b');
        const met = hudRef.current.querySelector('span');
        if (alt) alt.textContent = `ALT ${log.cumAt(drawn.tip).toLocaleString('en-US')}`;
        if (met) met.textContent = `T+${drawn.tip + 1}d`;
        const hw = hudRef.current.offsetWidth;
        hudRef.current.style.transform = `translate(${Math.min(w - hw - 4, here.x + 18)}px, ${here.y + 10}px)`;
        hudRef.current.style.opacity = String(Math.min(1, grow * 4) * (1 - erase));
      }
      if (nowRef.current && here) {
        const nw = nowRef.current.offsetWidth;
        nowRef.current.style.transform = `translate(${here.x - nw - 14}px, ${here.y - 8}px)`;
        nowRef.current.style.opacity = String((grow >= 1 ? 1 : 0) * (1 - erase));
      }

      // 提示：滑到的那個里程碑或那一天
      const tip = tipRef.current;
      if (tip) {
        let text = '';
        let date = '';
        let p: { x: number; y: number } | null = null;
        if (hit && hit.milestone >= 0) {
          const m = ms[hit.milestone];
          text = m.label;
          date = dotDate(m.date);
          p = at[hit.milestone];
        } else if (hit && hit.day >= 0 && dates[hit.day]) {
          text = contrib(log.counts[hit.day] ?? 0);
          date = dotDate(dates[hit.day]);
          p = log.lightOnScreen(w, h, look, hit.day);
        }
        if (p) {
          const key = `${date}|${text}`;
          if (tip.dataset.key !== key) {
            tip.dataset.key = key;
            const b = tip.querySelector('b');
            const s = tip.querySelector('span');
            if (b) b.textContent = text;
            if (s) s.textContent = date;
          }
          const tw = tip.offsetWidth;
          tip.style.transform = `translate(${Math.max(0, Math.min(w - tw, p.x - tw / 2))}px, ${p.y - tip.offsetHeight - 14}px)`;
          tip.style.opacity = '1';
        } else tip.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [log]);

  const hours = (min: number) => (min / 60).toFixed(1);
  const coded = coding ? Math.round(coding.todaySeconds / 60) : null;
  const maxPct = coding?.languages[0]?.percent ?? 1;

  return (
    <div className="lg" ref={pageRef}>
      <header className="lg-top">
        <div className="lg-head">
          <div className="lg-title">
            <h1>{t('log.title')}</h1>
            <span className="lg-latin">Log</span>
          </div>
          <p>{t('log.subtitle')}</p>
        </div>
        <div className="lg-met">
          <span>{t('log.met', { date: dotDate(LOG_START) })}</span>
          <b ref={metRef} suppressHydrationWarning />
        </div>
      </header>

      <div className="lg-scroll">
        <div className="lg-line" ref={boxRef}>
          <canvas ref={canvasRef} aria-hidden="true" />
          {/* 遙測讀數：跟著火箭走的高度（累積貢獻）與飛了幾天 */}
          <div className="lg-hud" ref={hudRef} aria-hidden="true">
            <b />
            <span />
          </div>
          <p className={days ? 'sr-only' : 'lg-nodata'}>
            {days ? t('log.total', { count: log.total }) : t('log.noContrib')}
          </p>
          <div className="lg-labels" aria-hidden="true">
            {milestones.map((m, k) =>
              m.level === 2 ? (
                <span
                  key={m.key}
                  className="lg-label"
                  ref={(el) => {
                    labelsRef.current[k] = el;
                  }}
                >
                  {m.label}
                </span>
              ) : null,
            )}
          </div>
          <span className="lg-now-label" ref={nowRef} aria-hidden="true">
            {t('log.now')}
          </span>
          <div className="lg-tip" ref={tipRef} aria-hidden="true">
            <b />
            <span />
          </div>
        </div>
      </div>

      {/* 里程碑的完整清單給報讀器（畫面上只標大轉折，其他的滑過才看得到） */}
      <ol className="sr-only">
        {milestones.map((m) => (
          <li key={m.key}>
            {dotDate(m.date)} {m.label}
          </li>
        ))}
      </ol>

      <ul className="lg-legend">
        <li>{t('log.legendHeight')}</li>
        <li>{t('log.legendDots')}</li>
        <li>{t('log.legendHeat')}</li>
      </ul>

      <section className="lg-status" aria-label={t('log.statusLabel')}>
        <div>
          <span className="lg-k">{t('log.coding')}</span>
          <span className="lg-v">
            {coded === null ? '—' : t('log.codingValue', { h: Math.floor(coded / 60), m: coded % 60 })}
          </span>
          <span className="lg-s">{t('log.codingVia')}</span>
        </div>
        <div>
          <span className="lg-k">{t('log.languages')}</span>
          {coding?.languages.length ? (
            <ul className="lg-bars">
              {coding.languages.map((l) => (
                <li key={l.name}>
                  <span>{l.name}</span>
                  <i style={{ width: `${(l.percent / maxPct) * 100}%` }} />
                  <em>{l.text}</em>
                </li>
              ))}
            </ul>
          ) : (
            <span className="lg-v">—</span>
          )}
        </div>
        <div>
          <span className="lg-k">{t('log.playing')}</span>
          <span className="lg-v">{playing?.recent?.name ?? '—'}</span>
          {playing && (
            <span className="lg-s">
              {playing.recent && t('log.played2w', { hours: hours(playing.recent.minutes2w), owned: playing.owned })}
              {playing.longest && (
                <>
                  <br />
                  {t('log.longest', { name: playing.longest.name, hours: Math.round(playing.longest.minutes / 60) })}
                </>
              )}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

/** 後端拿不到貢獻資料時：站點誕生到今天每天 0，軌跡是平的 */
function fallbackDays() {
  const n = Math.max(2, Math.round((Date.now() - new Date(`${LOG_START}T00:00:00`).getTime()) / 864e5) + 1);
  return Array.from({ length: n }, () => 0);
}
