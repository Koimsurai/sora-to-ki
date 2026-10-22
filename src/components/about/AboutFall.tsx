// 關於（自由落體版 demo）。整頁是一段下墜：往下捲就是往下掉，經過的每一層是我的某一年。
//   起點：很高的地方，名字與一段自介
//   下墜：九個里程碑（journeyData）一層一層掠過；右邊的高度計從 36,000 公里歸零，標出經過的年份
//   落地：「就此落下」——落在一顆只長了一棵樹的星球上，這裡是「現在」；抬頭是「未來」
//   地表：落地之後站在地表上，原本的技能、經歷、社團紀錄接在下面
// 近景（星塵、大氣、星球、樹）畫在 lib/fallSky.ts；遠處的星是 3D 的那一片。
import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { YEAR_LABELS, MILESTONE_STATIC, MILESTONES_BY_LANG } from '@/data/journeyData';
import { QUICK_FACTS_BY_LANG, PARAGRAPHS_BY_LANG } from '@/data/aboutData';
import { lookupOr } from '@/lib/tableLookup';
import { createFallSky } from '@/lib/fallSky';
import { smoothstep } from '@/lib/horizon';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import Expertise from './Expertise';
import WorkExperience from './WorkExperience';
import SchoolClubs from './SchoolClubs';
import './AboutFall.css';

/** 起點的高度（公里）：地球同步軌道那麼高 */
const TOP_KM = 36000;

/** 離開：往上飄走、淡掉（鏡頭要飛回首頁了） */
const LEAVE = {
  keyframes: [
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(-18vh)', opacity: 0 },
  ],
  options: { duration: 800, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' },
};
const stillAbout = () => stripLocalePrefix(window.location.pathname) === 'about';

const altitudeAt = (p: number) => Math.round(TOP_KM * Math.pow(1 - p, 1.7));
const fmt = (km: number) => km.toLocaleString('en-US');

export default function AboutFall() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const ylabels = lookupOr(YEAR_LABELS, lang, YEAR_LABELS['zh-TW']);
  const texts = lookupOr(MILESTONES_BY_LANG, lang, MILESTONES_BY_LANG['zh-TW']);
  const facts = lookupOr(QUICK_FACTS_BY_LANG, lang, QUICK_FACTS_BY_LANG['zh-TW']);
  const bio = lookupOr(PARAGRAPHS_BY_LANG, lang, PARAGRAPHS_BY_LANG['zh-TW']);
  const milestones = MILESTONE_STATIC.map((s, i) => ({
    ...s,
    label: s.year === 'NOW' ? ylabels.NOW : s.year === 'FUTURE' ? ylabels.FUTURE : s.year,
    ...texts[i],
    allTags: [...s.tags, ...texts[i].extraTags],
  }));
  const past = milestones.filter((m) => m.year !== 'NOW' && m.year !== 'FUTURE');
  const now = milestones.find((m) => m.year === 'NOW');
  const future = milestones.find((m) => m.year === 'FUTURE');

  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landRef = useRef<HTMLElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const yearRef = useRef<HTMLSpanElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const meterRef = useRef<HTMLElement | null>(null);

  // 從首頁飛過來：土星在身後、鏡頭快抵達時起點的字才出現
  useSkyPage(pageRef, { sky: 'default', ready: true, arriveAt: 1300, leave: LEAVE, stillHere: stillAbout });

  // 下墜：每幀從捲動位置算出進度與速度，畫近景、更新高度計（直接寫 DOM，不經過 React）
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    const page = pageRef.current;
    if (!cv || !ctx || !page) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = createFallSky(window.innerWidth < 760 ? 110 : 220);
    const stages = Array.from(page.querySelectorAll<HTMLElement>('[data-stage]'));
    let w = 0;
    let h = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
    let raf = 0;
    let last = -1;
    let lastY = window.scrollY;
    let velocity = 0;
    let shownYear = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last < 0 ? 1 / 60 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const y = window.scrollY;
      const land = landRef.current;
      const landTop = land ? land.getBoundingClientRect().top + y : document.body.scrollHeight;
      const fallEnd = Math.max(1, landTop - h * 0.35);
      const p = Math.min(1, Math.max(0, y / fallEnd));
      const ground = Math.min(1, Math.max(0, (y - landTop - h * 0.1) / h));
      velocity += ((y - lastY) / dt - velocity) * Math.min(1, dt * 8);
      lastY = y;
      const speed = reduce ? 0 : Math.min(1, Math.abs(velocity) / 2600);
      draw(ctx, w, h, { p, ground, speed, dt: reduce ? 0 : dt });

      // 高度計：數字、目前經過的那一年、標記的位置；落地之後收起來
      if (altRef.current) altRef.current.textContent = fmt(altitudeAt(p));
      if (markRef.current) markRef.current.style.transform = `translateY(${(p * 100).toFixed(2)}cqh)`;
      if (meterRef.current) meterRef.current.style.opacity = String(1 - smoothstep(0.96, 1, p));
      let current = '';
      for (const s of stages) if (s.getBoundingClientRect().top < h * 0.55) current = s.dataset.stage ?? '';
      if (current !== shownYear && yearRef.current) {
        shownYear = current;
        yearRef.current.textContent = current;
      }
    };
    raf = requestAnimationFrame(frame);

    // 卡片捲到才浮現
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    page.querySelectorAll('.af-card, .af-land-inner').forEach((el) => io.observe(el));

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      io.disconnect();
    };
  }, []);

  return (
    <div className="about-fall" ref={pageRef}>
      <canvas ref={canvasRef} className="af-sky" aria-hidden="true" />

      {/* 高度計 */}
      <aside className="af-meter" ref={meterRef} aria-hidden="true">
        <div className="af-meter-read">
          <span className="af-meter-key">距離地表</span>
          <span className="af-meter-num">
            <span ref={altRef}>{fmt(TOP_KM)}</span>
            <small>km</small>
          </span>
          <span className="af-meter-year" ref={yearRef} />
        </div>
        <div className="af-meter-rail">
          {past.map((m, i) => (
            <span key={m.id} className="af-meter-tick" style={{ top: `${((i + 1) / (past.length + 1)) * 100}%` }}>
              {m.label}
            </span>
          ))}
          <span className="af-meter-mark" ref={markRef} />
        </div>
      </aside>

      <header className="af-top">
        <p className="af-kicker">關於 · About</p>
        <h1 className="af-name">Koimsurai</h1>
        <p className="af-lede">
          這一頁是一段下墜。
          <br />
          從很高很高的地方開始——往下捲，就是往下掉；經過的每一層雲，都是我的某一年。
        </p>
        <p className="af-bio">{bio[0]}</p>
        <dl className="af-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="af-hint">鬆手，往下</p>
      </header>

      {past.map((m, i) => (
        <section key={m.id} className={`af-stage${i % 2 ? ' af-stage--right' : ''}`} data-stage={m.label}>
          <span className="af-ghost" aria-hidden="true">
            {m.label}
          </span>
          <article className="af-card" style={{ '--dot': m.color } as CSSProperties}>
            <p className="af-card-year">
              <span className="af-card-dot" aria-hidden="true" />
              {m.label}
            </p>
            <h2 className="af-card-title">{m.title}</h2>
            <p className="af-card-sub">{m.subtitle}</p>
            <p className="af-card-desc">{m.description}</p>
            {m.allTags.length > 0 && (
              <ul className="af-tags">
                {m.allTags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </article>
        </section>
      ))}

      <section className="af-land" ref={landRef}>
        <div className="af-land-inner">
          <h2 className="af-land-title">就此落下。</h2>
          <p className="af-land-lede">落在一顆只長了一棵樹的星球上——這裡是{now?.label ?? '現在'}。</p>
          {now && (
            <div className="af-now">
              <p className="af-card-title">{now.title}</p>
              <p className="af-card-sub">{now.subtitle}</p>
              <p className="af-card-desc">{now.description}</p>
              {now.allTags.length > 0 && (
                <ul className="af-tags">
                  {now.allTags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {future && (
            <p className="af-future">
              <span>抬頭，{future.label}還很遠。</span>
              {future.description}
            </p>
          )}
        </div>
      </section>

      {/* 地表：站在星球上，原本那幾份完整的紀錄 */}
      <div className="af-ground">
        <p className="af-ground-head">地表上的紀錄</p>
        <Expertise />
        <WorkExperience />
        <SchoolClubs />
      </div>
    </div>
  );
}
