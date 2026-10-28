// 航行日誌：把原本的「歷史」與「動態」合成一頁（/history；/activity 轉到這裡）。
// 整個視窗是一個升空的場景（about/logSky）：火箭從發射台離地，往遠方是時間、離地高度是累積的 GitHub 貢獻，
// 改版是軌道上的節點，每天的貢獻是地上的燈。標題疊在左上、任務經過時間（MET）疊在右上，
// 底部一條遙測列：高度與飛了幾天、今天寫了多久程式、這週的語言、最近在玩什麼。
// 換頁進來時琥珀點從正上方落在發射台，火箭垂直離地、一路爬到現在，穿過大氣層之後星空才浮出來；
// 離開時火箭沿機身方向飛走，點跟著機鼻。
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
import { sameTitle } from '@/lib/pageTitle';

/** 火箭從發射台爬到現在要幾秒 */
const CLIMB_S = 2.4;
/** 收：火箭飛走、其他淡掉的時間（毫秒，要在轉場等頁面收尾的 0.8 秒內） */
const ERASE_MS = 600;
/** 收完時點跟著火箭飛走的速度（px/ms） */
const LEAVE_SPEED = 0.9;
/** 比這窄就不標大轉折的名字（放不下） */
const NARROW_PX = 600;
/**
 * 比這窄（跟 Log.css 的 760 斷點同一個）：地上的燈一週一盞、讀數改成手指沿軌跡滑。
 * 一天一盞的燈在手機上會糊成一團白，滑過單一盞燈的提示也幾乎點不到
 */
const COMPACT_PX = 760;
/** 手指離里程碑多近（水平，CSS 像素）就吸到那個里程碑上 */
const SNAP_PX = 12;

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
  const altRef = useRef<HTMLElement>(null);
  const elapsedRef = useRef<HTMLElement>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const leaveRef = useRef<number | null>(null);
  const eraseRef = useRef(0);
  /** 鏡頭跟著滑鼠轉的量（-1–1，平滑過的） */
  const lookRef = useRef(0);
  const texts = {
    milestones,
    dayDates,
    contrib: (n: number) => t('log.contrib', { count: n }),
    altAt: (n: number) => t('log.altAt', { n: n.toLocaleString('en-US') }),
    weekCommits: (n: number) => t('log.weekCommits', { count: n }),
  };
  const textRef = useRef(texts);
  textRef.current = texts;

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
    /** 窄螢幕的讀數：手指（或滑鼠）停在畫面上的水平位置。放開之後留著，讀數才看得到 */
    let scrubX: number | null = null;
    let dragging = false;
    const compactNow = () => el.clientWidth < COMPACT_PX;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
      if (compactNow() && (dragging || e.pointerType === 'mouse')) scrubX = pointer[0];
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      if (!compactNow()) return;
      dragging = true;
      scrubX = pointer?.[0] ?? null;
      el.setPointerCapture(e.pointerId);
    };
    const onUp = () => {
      dragging = false;
    };
    // 觸控：點一下就停在那裡（手指離開時不清掉，提示才看得到）
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') pointer = null;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
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
      const compact = w < COMPACT_PX;
      // 鏡頭跟著滑鼠的水平位置轉一點點（平滑地跟）。窄螢幕不轉：手指在滑讀數，鏡頭跟著轉會讓軌跡在指尖下移動
      const want = pointer && !reduce && !compact ? (pointer[0] / w) * 2 - 1 : 0;
      lookRef.current += (want - lookRef.current) * Math.min(1, dt * 2);
      const look = lookRef.current;
      const ready = grow >= 1 && leaveRef.current === null;
      const hit = pointer && ready && !compact ? log.hit(w, h, look, pointer[0], pointer[1]) : null;
      // 窄螢幕的讀數：手指的水平位置對到軌跡上的那一天；靠近里程碑就吸過去
      let scrubDay = -1;
      let snapped = -1;
      const sx = scrubX;
      if (compact && ready && sx !== null) {
        scrubDay = log.dayAtX(w, h, look, sx);
        let best = SNAP_PX;
        log.milestonesAt(w, h, look).forEach((p, k) => {
          const d = p ? Math.abs(p.x - sx) : Infinity;
          if (d < best) {
            best = d;
            snapped = k;
          }
        });
        if (snapped >= 0) scrubDay = log.milestoneIndex[snapped];
      }
      const drawn = log.draw(ctx, {
        w,
        h,
        t: reduce ? 0 : real,
        dt: reduce ? 0 : dt,
        grow,
        erase,
        look,
        milestone: compact ? snapped : (hit?.milestone ?? -1),
        day: hit?.day ?? -1,
        rocket,
        compact,
        scrub: scrubDay,
      });

      // 先換字、再一次量完尺寸、最後才寫位置（同首頁衛星的字，home/HomeOrbit）：讀寫交錯的話，
      // 每讀一次 offsetWidth 瀏覽器就得把前一塊剛寫的樣式排一次版。這裡寫的 transform、opacity 都不影響尺寸
      const at = log.milestonesAt(w, h, look);
      const { milestones: ms, dayDates: dates, contrib, altAt, weekCommits } = textRef.current;
      // 遙測列的高度（累積貢獻）與飛了幾天：跟著火箭爬升一起跳
      const here = drawn.now;
      const altText = log.cumAt(drawn.tip).toLocaleString('en-US');
      if (altRef.current && altRef.current.textContent !== altText) altRef.current.textContent = altText;
      const dayText = `${drawn.tip + 1}d`;
      if (elapsedRef.current && elapsedRef.current.textContent !== dayText) elapsedRef.current.textContent = dayText;

      // 提示：滑到的那個里程碑或那一天
      const tip = tipRef.current;
      let tipAt: { x: number; y: number } | null = null;
      if (tip) {
        let text = '';
        let date = '';
        if (scrubDay >= 0) {
          // 窄螢幕的讀數：日期、那時飛到多高（累積貢獻）、那一週幾次；吸到里程碑時標題是它的名字
          const when = dates[scrubDay] ? dotDate(dates[scrubDay]) : '';
          const detail = `${altAt(log.cumAt(scrubDay))} · ${weekCommits(log.weekOf(scrubDay))}`;
          text = snapped >= 0 ? ms[snapped].label : when;
          date = snapped >= 0 ? `${when} · ${detail}` : detail;
          tipAt = log.pathOnScreen(w, h, look, scrubDay);
        } else if (hit && hit.milestone >= 0) {
          const m = ms[hit.milestone];
          text = m.label;
          date = dotDate(m.date);
          tipAt = at[hit.milestone];
        } else if (hit && hit.day >= 0 && dates[hit.day]) {
          text = contrib(log.counts[hit.day] ?? 0);
          date = dotDate(dates[hit.day]);
          tipAt = log.lightOnScreen(w, h, look, hit.day);
        }
        if (tipAt) {
          const key = `${date}|${text}`;
          if (tip.dataset.key !== key) {
            tip.dataset.key = key;
            const b = tip.querySelector('b');
            const span = tip.querySelector('span');
            if (b) b.textContent = text;
            if (span) span.textContent = date;
          }
        }
      }

      const sizes = ms.map((m, k) => {
        const label = m.level === 2 ? labelsRef.current[k] : null;
        return label ? { w: label.offsetWidth, h: label.offsetHeight } : null;
      });
      const nowW = nowRef.current?.offsetWidth ?? 0;
      const tipW = tipAt ? (tip?.offsetWidth ?? 0) : 0;
      const tipH = tipAt ? (tip?.offsetHeight ?? 0) : 0;

      // 字跟著軌跡：大轉折的名字在點的上方左右交錯（下方是地上的刻度），火箭飛過去才出現；靠太近的往上讓開
      let flip = false;
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      ms.forEach((m, k) => {
        if (m.level !== 2) return;
        const label = labelsRef.current[k];
        const p = at[k];
        const size = sizes[k];
        if (!label || !p || !size) return;
        const { w: lw, h: lh } = size;
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
      if (nowRef.current && here) {
        nowRef.current.style.transform = `translate(${here.x - nowW - 14}px, ${here.y - 8}px)`;
        nowRef.current.style.opacity = String((grow >= 1 ? 1 : 0) * (1 - erase));
      }
      if (tip) {
        if (tipAt) {
          tip.style.transform = `translate(${Math.max(0, Math.min(w - tipW, tipAt.x - tipW / 2))}px, ${tipAt.y - tipH - 14}px)`;
          tip.style.opacity = '1';
        } else tip.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [log]);

  const hours = (min: number) => (min / 60).toFixed(1);
  const coded = coding ? Math.round(coding.todaySeconds / 60) : null;
  const maxPct = coding?.languages[0]?.percent ?? 1;

  return (
    <div className="lg" ref={pageRef}>
      {/* 升空場景鋪滿整個視窗，標題、遙測列都疊在上面 */}
      <div className="lg-line" ref={boxRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
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

      <header className="lg-top">
        <div className="lg-head">
          <div className="lg-title">
            <h1>{t('log.title')}</h1>
            {!sameTitle(t('log.title'), 'Log') && <span className="lg-latin">Log</span>}
          </div>
          <p>{t('log.subtitle')}</p>
        </div>
        <div className="lg-met">
          <span>{t('log.met', { date: dotDate(LOG_START) })}</span>
          <b ref={metRef} suppressHydrationWarning />
        </div>
      </header>

      {/* 里程碑的完整清單給報讀器（畫面上只標大轉折，其他的滑過才看得到） */}
      <ol className="sr-only">
        {milestones.map((m) => (
          <li key={m.key}>
            {dotDate(m.date)} {m.label}
          </li>
        ))}
      </ol>

      {/* 遙測列：像發射直播畫面底下那排讀數 */}
      <footer className="lg-strip" aria-label={t('log.statusLabel')}>
        <ul className="lg-legend">
          <li>{t('log.legendHeight')}</li>
          <li>{t('log.legendDots')}</li>
          <li>{t('log.legendHeat')}</li>
        </ul>
        {/* 窄螢幕的圖例：燈是一週一盞；高度是什麼由讀數自己說（滑一下就看到「高度 N（累積貢獻）」） */}
        <ul className="lg-legend lg-legend-compact">
          <li>{t('log.legendWeek')}</li>
          <li>{t('log.scrubHint')}</li>
        </ul>
        <div className="lg-strip-row">
          <div className="lg-cell lg-cell-flight">
            <div>
              <span className="lg-k">ALT</span>
              <b className="lg-v" ref={altRef} />
              <span className="sr-only">{days ? t('log.total', { count: log.total }) : t('log.noContrib')}</span>
            </div>
            <div>
              <span className="lg-k">T+</span>
              <b className="lg-v" ref={elapsedRef} />
            </div>
          </div>
          <div className="lg-cell">
            <span className="lg-k">{t('log.coding')}</span>
            <b className="lg-v">
              {coded === null ? '—' : t('log.codingValue', { h: Math.floor(coded / 60), m: coded % 60 })}
            </b>
            <span className="lg-s">{t('log.codingVia')}</span>
          </div>
          <div className="lg-cell lg-cell-langs">
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
              <b className="lg-v">—</b>
            )}
          </div>
          {/* 窄螢幕放不下每個語言一條：收成一條分段的橫條，名字照份量排在下面 */}
          {coding?.languages.length ? (
            <div className="lg-cell lg-cell-stack">
              <span className="lg-k">{t('log.languages')}</span>
              <div className="lg-stack" aria-hidden="true">
                {coding.languages.map((l) => (
                  <i key={l.name} style={{ flexGrow: l.percent }} />
                ))}
              </div>
              <span className="lg-s">{coding.languages.map((l) => l.name).join(' · ')}</span>
            </div>
          ) : null}
          <div className="lg-cell lg-cell-play">
            <span className="lg-k">{t('log.playing')}</span>
            <b className="lg-v">{playing?.recent?.name ?? '—'}</b>
            {playing && (
              <span className="lg-s">
                {playing.recent && t('log.played2w', { hours: hours(playing.recent.minutes2w), owned: playing.owned })}
                {playing.longest && (
                  <>
                    <br />
                    {t('log.longest', {
                      name: playing.longest.name,
                      hours: Math.round(playing.longest.minutes / 60),
                    })}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** 後端拿不到貢獻資料時：站點誕生到今天每天 0，軌跡是平的 */
function fallbackDays() {
  const n = Math.max(2, Math.round((Date.now() - new Date(`${LOG_START}T00:00:00`).getTime()) / 864e5) + 1);
  return Array.from({ length: n }, () => 0);
}
