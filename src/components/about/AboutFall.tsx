// 關於（自由落體版 demo）。整頁是一段下墜：往下捲就是往下掉，經過的每一層是我的某一年。
//   起點：很高的地方，只有一句話
//   下墜：九個里程碑（journeyData）一層一層掠過；右邊的高度計從 36,000 公里歸零，標出經過的年份
//   落地：「就此落下」——落在一顆只長了一棵樹的星球上，這裡是「現在」；抬頭是「未來」
//   地底：落地之後繼續往下挖，一層一層是更深的生活——手上的東西、做過的事、一起走過的人，最底下是地心
// 近景（星塵、大氣、星球、樹）畫在 lib/fallSky.ts；遠處的星是 3D 的那一片。
import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { YEAR_LABELS, MILESTONE_STATIC, MILESTONES_BY_LANG, MILESTONE_BEATS_BY_LANG } from '@/data/journeyData';
import {
  QUICK_FACTS_BY_LANG,
  PERIODS,
  TAGS,
  EXPERIENCES_BY_LANG,
  CLUB_PERIODS,
  CLUBS_BY_LANG,
  NAMES_BY_LANG,
  CATEGORIES_BASE,
} from '@/data/aboutData';
import { lookupOr } from '@/lib/tableLookup';
import { ICON_MAP } from '@/data/skillIcons';
import { createFallSky } from '@/lib/fallSky';
import { smoothstep } from '@/lib/horizon';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import './AboutFall.css';

/** 起點的高度（公里）：地球同步軌道那麼高 */
const TOP_KM = 36000;

/** 離開：回首頁是倒著往上升，字往下沉走；去其他頁就淡掉 */
const LEAVE = {
  keyframes: [
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(24vh)', opacity: 0 },
  ],
  options: { duration: 800, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' },
};
const stillAbout = () => stripLocalePrefix(window.location.pathname) === 'about';

const altitudeAt = (p: number) => Math.round(TOP_KM * Math.pow(1 - p, 1.7));
const fmt = (km: number) => km.toLocaleString('en-US');
const pad = (n: number) => String(n).padStart(2, '0');

/** 技能的圖示：平常是跟字同色的單色，滑過去才亮出品牌色（一整片品牌色會蓋過地層的安靜） */
function SkillMark({ name }: { name: string }) {
  const entry = ICON_MAP[name];
  if (!entry) return null;
  const [Icon, color] = entry;
  return (
    <span className="af-skill-icon" style={{ '--brand': color } as CSSProperties}>
      <Icon />
    </span>
  );
}

export default function AboutFall() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const ylabels = lookupOr(YEAR_LABELS, lang, YEAR_LABELS['zh-TW']);
  const texts = lookupOr(MILESTONES_BY_LANG, lang, MILESTONES_BY_LANG['zh-TW']);
  const facts = lookupOr(QUICK_FACTS_BY_LANG, lang, QUICK_FACTS_BY_LANG['zh-TW']);
  const beatsByLang = lang in MILESTONE_BEATS_BY_LANG ? MILESTONE_BEATS_BY_LANG[lang] : undefined;
  const work = lookupOr(EXPERIENCES_BY_LANG, lang, EXPERIENCES_BY_LANG['zh-TW']);
  const clubs = lookupOr(CLUBS_BY_LANG, lang, CLUBS_BY_LANG['zh-TW']);
  const skillNames = lookupOr(NAMES_BY_LANG, lang, NAMES_BY_LANG['zh-TW']);
  const milestones = MILESTONE_STATIC.map((s, i) => ({
    ...s,
    label: s.year === 'NOW' ? ylabels.NOW : s.year === 'FUTURE' ? ylabels.FUTURE : s.year,
    ...texts[i],
    allTags: [...s.tags, ...texts[i].extraTags],
    // 短句片段；這個語系還沒寫的話，整段說明當成一個片段
    beats: beatsByLang?.[i] ?? [texts[i].description],
  }));
  const past = milestones.filter((m) => m.year !== 'NOW' && m.year !== 'FUTURE');
  const now = milestones.find((m) => m.year === 'NOW');

  // 期間的資料寫成「2025/7 — Now」；這一頁不用破折號，中文介面也把 Now 換成「現在」
  const zh = lang.startsWith('zh');
  const period = (p: string) => p.replace(' — ', ' ～ ').replace('Now', zh ? '現在' : 'Now');
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landRef = useRef<HTMLElement | null>(null);
  const altRef = useRef<HTMLSpanElement | null>(null);
  const yearRef = useRef<HTMLSpanElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const meterRef = useRef<HTMLElement | null>(null);
  const keyRef = useRef<HTMLSpanElement | null>(null);
  const unitRef = useRef<HTMLElement | null>(null);
  const groundRef = useRef<HTMLDivElement | null>(null);

  // 從首頁飛過來：土星在身後、鏡頭快抵達時起點的字才出現
  useSkyPage(pageRef, { sky: 'about', ready: true, arriveAt: 1300, leave: LEAVE, stillHere: stillAbout });

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
      // 地底：從地層區的頂端開始算往下挖了多少
      const groundEl = groundRef.current;
      const groundTop = groundEl ? groundEl.getBoundingClientRect().top + y : Infinity;
      const groundLen = groundEl ? Math.max(1, groundEl.offsetHeight - h * 0.5) : 1;
      const dig = Math.max(0, y + h * 0.5 - groundTop);
      const depth = Math.min(1, dig / groundLen);
      draw(ctx, w, h, { p, ground, speed, dt: reduce ? 0 : dt, depth, dig });

      // 高度計：下墜時是「距離地表」幾公里；落地時收起來；往地底挖時換成「地表以下」幾公尺
      const digging = dig > 0;
      meterRef.current?.classList.toggle('is-digging', digging);
      if (keyRef.current) keyRef.current.textContent = digging ? '地表以下' : '距離地表';
      if (unitRef.current) unitRef.current.textContent = digging ? 'm' : 'km';
      if (altRef.current) altRef.current.textContent = fmt(digging ? Math.round(depth * 320) : altitudeAt(p));
      const mark = digging ? depth : p;
      if (markRef.current) markRef.current.style.transform = `translateY(${(mark * 100).toFixed(2)}cqh)`;
      if (meterRef.current) {
        meterRef.current.style.opacity = String(digging ? smoothstep(0, 120, dig) : 1 - smoothstep(0.96, 1, p));
      }
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
    page.querySelectorAll('.af-chapter, .af-beat, .af-land-inner, .af-layer, .af-core').forEach((el) => io.observe(el));

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
          <span className="af-meter-key" ref={keyRef}>
            距離地表
          </span>
          <span className="af-meter-num">
            <span ref={altRef}>{fmt(TOP_KM)}</span>
            <small ref={unitRef}>km</small>
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

      {/* 起點：只有一句話。其他的，往下掉的時候一層一層會經過 */}
      <header className="af-top">
        <p className="af-kicker">
          關於<span>About</span>
        </p>
        <h1 className="af-title">坐穩了。</h1>
        <p className="af-hint">往下</p>
      </header>

      {/* 每一年是一章：左邊固定「年份＋標題」（現在在哪一層），右邊的片段一段一段往上掠過；
          換到下一年時，固定的那塊才被推走（position: sticky 在 grid 裡的接力） */}
      {past.map((m, i) => {
        const [from, to] = m.label.split('-');
        return (
          <section key={m.id} className="af-chapter" data-stage={m.label}>
            <aside className="af-chapter-panel">
              <p className="af-chapter-no">
                {pad(i + 1)} / {pad(past.length)}
              </p>
              <p className={`af-chapter-year${from.length > 4 ? ' is-long' : ''}`}>
                {from}
                {to && <span>～ {to}</span>}
              </p>
              <h2 className="af-chapter-title">{m.title}</h2>
              <p className="af-chapter-sub">{m.subtitle}</p>
              <p className="af-chapter-alt">{fmt(altitudeAt((i + 1) / (past.length + 1)))} km</p>
            </aside>
            <div className="af-beats">
              {m.beats.map((b) => (
                <p key={b} className="af-beat">
                  {b}
                </p>
              ))}
              {m.allTags.length > 0 && <p className="af-beat-tags">{m.allTags.join(' · ')}</p>}
            </div>
          </section>
        );
      })}

      {/* 落地：一句話、現在在做的事，然後是一句話收尾。不放條列，不放說明 */}
      <section className="af-land" ref={landRef}>
        <div className="af-land-inner">
          <p className="af-land-pre">掠過無數個稚嫩與迷惘的昨日，</p>
          <h2 className="af-land-title">就此落下。</h2>
          {now && (
            <p className="af-land-now">
              <span>{now.label}</span>
              {now.title}
            </p>
          )}
          <blockquote className="af-quote">
            <p>
              Stay hungry,
              <br />
              stay foolish.
            </p>
            <cite>Steve Jobs</cite>
          </blockquote>
        </div>
      </section>

      {/* 地底：落地之後繼續往下挖。一層一層是更深的生活，最底下是地心 */}
      <div className="af-ground" ref={groundRef}>
        <section className="af-layer" data-stage="地表">
          <header className="af-layer-head">
            <span className="af-layer-tag">地表</span>
            <h2>握在手裡的</h2>
            <p>一路帶著的東西。</p>
          </header>
          <dl className="af-facts">
            {facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="af-skills">
            {CATEGORIES_BASE.map((c) => (
              <div key={c.label} className="af-skill">
                <h3>{skillNames[c.label] ?? c.label}</h3>
                <ul className="af-skill-list">
                  {c.items.map((name) => (
                    <li key={name}>
                      <SkillMark name={name} />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="af-layer" data-stage="第一層">
          <header className="af-layer-head">
            <span className="af-layer-tag">第一層</span>
            <h2>做過的事</h2>
            <p>被時間壓實的日子。</p>
          </header>
          {work.map((e, i) => (
            <article key={e.title} className="af-entry">
              <p className="af-entry-when">{period(PERIODS[i])}</p>
              <div>
                <h3 className="af-entry-title">{e.title}</h3>
                <p className="af-entry-role">{e.role}</p>
                {e.summary && <p className="af-entry-summary">{e.summary}</p>}
                {e.groups?.map((g) => (
                  <div key={g.heading} className="af-entry-group">
                    <h4>{g.heading}</h4>
                    <ul>
                      {g.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {e.bullets && (
                  <ul>
                    {e.bullets.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                )}
                <ul className="af-tags">
                  {(TAGS[i] ?? []).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>

        <section className="af-layer" data-stage="第二層">
          <header className="af-layer-head">
            <span className="af-layer-tag">第二層</span>
            <h2>一起走過的人</h2>
            <p>一起熬過的夜。</p>
          </header>
          {clubs.map((c, i) => (
            <article key={c.name} className="af-entry">
              <p className="af-entry-when">{period(CLUB_PERIODS[i])}</p>
              <div>
                <h3 className="af-entry-title">{c.name}</h3>
                <p className="af-entry-role">{c.role}</p>
                <ul>
                  {c.activities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>

        <section className="af-core" data-stage="地心">
          <p>再往下，是還沒寫下的事。</p>
        </section>
      </div>
    </div>
  );
}
