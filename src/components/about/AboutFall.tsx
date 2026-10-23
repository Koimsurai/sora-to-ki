// 關於：整頁是一段下墜。往下捲就是往下掉，經過的每一層是我的某一年；落地時只留「就此落下」，
// 之後繼續往地底挖：地表是手上的東西，第一層是做過的事，最深的地心才是「Stay hungry, stay foolish.」。
// 近景（掠過的細線、地平線與樹、返回艙、地層、高度計）畫在 fallSky。
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MILESTONE_BEATS_BY_LANG, MILESTONE_STATIC, MILESTONES_BY_LANG, YEAR_LABELS } from '@/data/journeyData';
import { SKILLS, WORK_BY_LANG, WORK_PERIODS } from '@/data/aboutData';
import { lookupOr } from '@/lib/tableLookup';
import { createFallSky } from './fallSky';
import './AboutFall.css';

/** 每一年留哪一句（MILESTONE_BEATS_BY_LANG 裡的第幾個片段）：一年只說一句話 */
const KEY_BEAT = [0, 2, 2, 2, 1, 0, 3, 2];
const CHUTE_SRC = '/illustrations/reentry-parachute.webp';

export default function AboutFall() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const years = lookupOr(YEAR_LABELS, lang, YEAR_LABELS['zh-TW']);
  const texts = lookupOr(MILESTONES_BY_LANG, lang, MILESTONES_BY_LANG['zh-TW']);
  const beats = lang in MILESTONE_BEATS_BY_LANG ? MILESTONE_BEATS_BY_LANG[lang] : undefined;
  const work = lookupOr(WORK_BY_LANG, lang, WORK_BY_LANG['zh-TW']);
  const zh = lang.startsWith('zh');
  // 期間寫成「2025/7 — Now」；這一頁不用破折號，中文介面也把 Now 換成「現在」
  const period = (p: string) => p.replace(' — ', ' ～ ').replace('Now', zh ? '現在' : 'Now');

  const chapters = MILESTONE_STATIC.flatMap((m, i) => {
    if (m.year === 'FUTURE') return [];
    const text = texts[i];
    const beat = beats?.[i]?.[KEY_BEAT[i] ?? 0] ?? text.description;
    return [
      {
        id: m.id,
        now: m.year === 'NOW',
        year: m.year === 'NOW' ? years.NOW : m.year.replace('-', ' – '),
        ...text,
        beat,
      },
    ];
  });
  const now = chapters.find((c) => c.now);

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLElement>(null);
  const labelsRef = useRef({ fall: '', dig: '' });
  labelsRef.current = { fall: t('aboutFall.fallMeter'), dig: t('aboutFall.digMeter') };

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    const page = pageRef.current;
    if (!cv || !ctx || !page) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chute = new Image();
    chute.src = CHUTE_SRC;
    const sky = createFallSky(window.innerWidth < 760 ? 70 : 130, chute);
    const mono = getComputedStyle(root).getPropertyValue('--mono-font').trim() || 'monospace';
    const chapterEls = [...page.querySelectorAll<HTMLElement>('.af-ch')];
    let raf = 0;
    let last = 0;
    let lastY = window.scrollY;
    let travelled = 0;
    let speed = 0;
    const onScroll = () => {
      travelled += Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      const land = landRef.current;
      const layer = layerRef.current;
      const core = coreRef.current;
      if (!land || !layer || !core) return;
      // 速度：這一幀捲了多少，平滑一下（px/s）
      speed += (travelled / Math.max(dt, 0.016) - speed) * Math.min(1, dt * 6);
      travelled = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pageTop = page.getBoundingClientRect().top + window.scrollY;
      sky.draw(ctx, {
        w,
        h,
        t: now / 1000,
        dt: reduce ? 0 : dt,
        top: window.scrollY - pageTop,
        speed: reduce ? 0 : Math.min(1, speed / 2500),
        landTop: land.offsetTop,
        layerTop: layer.offsetTop,
        coreMid: core.offsetTop + core.offsetHeight / 2,
        chapterMids: chapterEls.map((c) => c.offsetTop + c.offsetHeight / 2),
        maxScroll: page.offsetHeight - h,
        labels: labelsRef.current,
        mono,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="af" ref={pageRef}>
      <canvas className="af-sky" ref={canvasRef} aria-hidden="true" />

      <header className="af-top">
        <p className="af-kick">
          {t('aboutFall.kick')}
          <span>About</span>
        </p>
        <h1>{t('aboutFall.title')}</h1>
        <p className="af-hint">{t('aboutFall.hint')}</p>
      </header>

      <div id="journey">
        {chapters.map((c) => (
          <section key={c.id} className="af-ch" aria-label={c.year}>
            <div className={c.now ? 'af-year is-word' : 'af-year'}>{c.year}</div>
            <h2 className="af-title">{c.title}</h2>
            <div className="af-sub">{c.subtitle}</div>
            <p className="af-beat">{c.beat}</p>
          </section>
        ))}
      </div>

      <section className="af-land" ref={landRef}>
        <p>{t('aboutFall.landPre')}</p>
        <h2>{t('aboutFall.land')}</h2>
        {now && (
          <p className="af-now">
            <span>Now</span>
            {now.title}
          </p>
        )}
      </section>

      <section className="af-layer" ref={layerRef}>
        <span className="af-lab">{t('aboutFall.surface')}</span>
        <h2>
          {t('aboutFall.surfaceTitle')}
          <small>{t('aboutFall.surfaceSub')}</small>
        </h2>
        <ul className="af-skills">
          {SKILLS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="af-layer">
        <span className="af-lab">{t('aboutFall.layer1')}</span>
        <h2>{t('aboutFall.layer1Title')}</h2>
        <ul className="af-jobs">
          {work.map((j, i) => (
            <li key={j.title}>
              <time>{period(WORK_PERIODS[i] ?? '')}</time>
              <p>
                <b>{j.title}</b>
                <span>{j.role}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="af-core" ref={coreRef}>
        <span className="af-lab">{t('aboutFall.core')}</span>
        <p>{t('aboutFall.coreLine')}</p>
        <blockquote>
          Stay hungry,
          <br />
          stay foolish.
        </blockquote>
        <cite>Steve Jobs</cite>
      </section>
    </div>
  );
}
