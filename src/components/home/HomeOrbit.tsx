// 首頁門面（2026-10 翻新，提案的 B）：五個分區是繞著土星轉的五顆衛星。
//
// 土星、軌道與衛星都是 3D 背景裡的東西（lib/starfieldGpu 的 buildSaturn）。這裡只放字：每顆衛星
// 一個連結（名字、最新一則、數字），平常看不見，滑鼠靠近那顆衛星、或鍵盤停在那個連結上才浮出來，
// 同時把亮度送回 3D，那條軌道與那顆衛星跟著亮。閒著的時候，偶爾有一顆自己亮一下。
// 字的位置每幀跟著 3D 送來的衛星位置走（store/homeOrbit）。
//
// 沒有 3D 的時候（手機、沒有硬體加速）收不到位置，五個連結就直接排成一欄。
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocaleLink } from '@/i18n/locale-link';
import { MAIN_SECTIONS } from '@/data/siteSections';
import { homeDigestQueryOptions, siteStatsQueryOptions } from '@/data/homeData';
import { watchStatsQueryOptions } from '@/data/watchData';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { collapseSaturnTo, setSatelliteGlow, subscribeSatellites, type SatelliteScreen } from '@/store/homeOrbit';
import { after, type Pt } from '@/store/pageTransition';
import { usePageTransition } from '@/hooks/usePageTransition';
import './HomeOrbit.css';

/** 作品頁做好之前，衛星上先列這幾個（照提案的作品清單） */
const WORKS = ['tessera', 'nuntius', 'anigamer-rs', 'session-to-obsidian', 'flow2code', 'sora-to-ki', 'VoltiCar'];
/** 滑鼠離衛星多近才算「靠近」（CSS 像素） */
const NEAR_PX = 72;
/** 閒置多久之後開始輪流提示 */
const IDLE_HINT_MS = 2500;
/** 每顆提示多久 */
const HINT_MS = 4500;
/** 多久沒收到 3D 送來的位置就當作沒有 3D */
const FLAT_AFTER_MS = 2500;
/** 換頁時土星收進衛星的時間（跟 lib/starfieldGpu 的 COLLAPSE_S 一樣） */
const SATURN_COLLAPSE_MS = 380;

// 照字素切：碎念裡的 emoji 是好幾個碼位組成的，照碼位切會切出半個
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const clip = (text: string, n: number) => {
  const chars = Array.from(graphemes.segment(text.replace(/\s+/g, ' ').trim()), (g) => g.segment);
  return chars.length > n ? `${chars.slice(0, n).join('')}⋯` : chars.join('');
};

export default function HomeOrbit() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { data: digest } = useQuery(homeDigestQueryOptions(locale));
  const { data: stats } = useQuery(siteStatsQueryOptions);
  const { data: watch } = useQuery(watchStatsQueryOptions);
  const sectionRef = useRef<HTMLElement>(null);
  const labelsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const [flat, setFlat] = useState(false);
  /** 衛星在畫面上的位置與速度（px/ms），轉場的「收」要用 */
  const positionsRef = useRef<SatelliteScreen[]>([]);
  const velocityRef = useRef<Pt[]>([]);

  // 換頁轉場：首頁的錨點是土星的中心。換進來時點飛到這裡、土星從這一點撐開（3D 那邊自己長，
  // 見 StarfieldGpu），所以「長」由首頁接手。換出去時整組收進點下去的那顆衛星，點順著那顆衛星的
  // 軌道方向飛出去；從導覽列或上一頁離開就收進土星中心
  const center = (): Pt => ({
    x: window.innerWidth / 2,
    y: window.innerHeight * (window.innerHeight > window.innerWidth ? 0.46 : 0.5),
  });
  usePageTransition({
    anchor: center,
    leave: ({ source }) => {
      // 3D 沒跑起來（平面的備案）：沒有土星可以收，交給預設的遮罩
      if (flat) return null;
      const i = source === null ? -1 : Number(source);
      const sat = positionsRef.current[i] as SatelliteScreen | undefined;
      collapseSaturnTo(sat ? i : -1);
      sectionRef.current?.classList.add('is-leaving');
      // 收到最後一小段就放行：點在土星消失的那一刻已經在動了，不會停在原地等
      const done = after(SATURN_COLLAPSE_MS * 0.8);
      if (!sat) return { point: center(), done };
      const v = velocityRef.current[i] ?? { x: 0, y: 0 };
      const speed = Math.hypot(v.x, v.y) || 1;
      return { point: { x: sat.x, y: sat.y }, velocity: { x: (v.x / speed) * 0.9, y: (v.y / speed) * 0.9 }, done };
    },
    onGrow: () => 'self',
  });

  const post = digest?.posts[0];
  const thought = digest?.thoughts[0];
  const short = (s: string) => dotDate(parseServerDate(s), true);
  const lines: Partial<Record<string, { line: string; n: string }>> = {
    notes: {
      line: post ? clip(post.title.split(/[：:]\s?/)[0] ?? post.title, 26) : '',
      n: stats && post ? t('home.orbit.notesCount', { count: stats.total_posts, date: short(post.created_at) }) : '',
    },
    moments: {
      line: thought ? clip(thought.content, 24) : '',
      n: thought ? t('home.orbit.momentsCount', { date: short(thought.created_at) }) : '',
    },
    works: { line: `${WORKS.slice(0, 3).join('、')}⋯`, n: t('home.orbit.worksCount', { count: WORKS.length }) },
    collection: {
      line: watch
        ? t('home.orbit.collectionLine', {
            anime: watch.animeCount,
            films: watch.filmCount,
            series: watch.tvSeriesCount,
          })
        : '',
      n: watch ? String(watch.animeCount + watch.filmCount + watch.tvSeriesCount) : '',
    },
    about: { line: t('home.orbit.aboutLine'), n: t('home.orbit.aboutCount') },
  };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const count = MAIN_SECTIONS.length;
    let positions: SatelliteScreen[] = [];
    let lastPositionsAt = performance.now();
    let pointer: [number, number] | null = null;
    let focused = -1;
    let tapped = -1;
    let hovered = -1;
    let lastInput = performance.now();
    let hintIndex = 0;
    let hintStart = 0;
    let raf = 0;
    let flatNow = false;

    const unsubscribe = subscribeSatellites((next) => {
      const now = performance.now();
      const prev = positionsRef.current;
      if (next.length && prev.length === next.length && now > lastPositionsAt) {
        velocityRef.current = next.map((p, i) => ({
          x: (p.x - prev[i].x) / (now - lastPositionsAt),
          y: (p.y - prev[i].y) / (now - lastPositionsAt),
        }));
      }
      positions = next;
      positionsRef.current = next;
      if (next.length) lastPositionsAt = now;
    });

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer = [e.clientX, e.clientY];
      lastInput = performance.now();
      // 從衛星移到字上會離開「靠近」的範圍：指在字上的時候那顆要一直亮著，字才點得到
      const label = (e.target as Element).closest<HTMLAnchorElement>('.horbit-label');
      hovered = label ? labelsRef.current.indexOf(label) : -1;
    };
    const onLeave = () => {
      pointer = null;
      hovered = -1;
    };
    // 觸控沒有「靠近」：點一下畫面就依序指到下一顆（點到字本身就照常進那一頁）
    const onTap = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as Element).closest('.horbit-label')) return;
      tapped = (tapped + 1) % count;
      lastInput = performance.now();
    };
    const onFocusIn = (e: FocusEvent) => {
      const i = labelsRef.current.indexOf(e.target as HTMLAnchorElement);
      if (i >= 0) focused = i;
    };
    const onFocusOut = () => {
      focused = -1;
    };
    section.addEventListener('pointermove', onMove);
    section.addEventListener('pointerleave', onLeave);
    section.addEventListener('pointerdown', onTap);
    section.addEventListener('focusin', onFocusIn);
    section.addEventListener('focusout', onFocusOut);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const live = positions.length === count && now - lastPositionsAt < FLAT_AFTER_MS;
      const nextFlat = !live && now - lastPositionsAt > FLAT_AFTER_MS;
      if (nextFlat !== flatNow) {
        flatNow = nextFlat;
        setFlat(nextFlat);
      }
      if (!live) return;

      let near = focused >= 0 ? focused : hovered >= 0 ? hovered : tapped;
      if (near < 0 && pointer) {
        const [px, py] = pointer;
        let best = NEAR_PX;
        positions.forEach((p, i) => {
          const d = Math.hypot(p.x - px, p.y - py);
          if (!p.hidden && d < best) {
            best = d;
            near = i;
          }
        });
      }
      // 閒著的時候輪流提示一顆：亮一下又暗下去，字只浮出一半
      let hint = -1;
      let hintLevel = 0;
      if (near < 0 && now - lastInput > IDLE_HINT_MS) {
        if (!hintStart) hintStart = now;
        const k = (now - hintStart) / HINT_MS;
        hintIndex = Math.floor(k) % count;
        hint = hintIndex;
        hintLevel = Math.max(0, Math.sin(Math.min(1, (k % 1) / 0.55) * Math.PI)) * 0.5;
      } else hintStart = 0;

      const glow = MAIN_SECTIONS.map((_, i) => (i === near ? 1 : i === hint ? hintLevel : 0));
      setSatelliteGlow(glow);

      const box = section.getBoundingClientRect();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      positions.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        // 字往「遠離土星」的那一側長，不壓在軌道與土星上
        const right = p.x > cx;
        el.classList.toggle('is-left', !right);
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let x = right ? p.x + 18 : p.x - w - 18;
        let y = p.y < cy ? p.y - h - 10 : p.y + 10;
        x = Math.max(16, Math.min(window.innerWidth - w - 16, x));
        y = Math.max(72, Math.min(window.innerHeight - h - 16, y));
        el.style.transform = `translate(${x - box.left}px, ${y - box.top}px)`;
        el.dataset.tx = p.x.toFixed(1);
        el.dataset.ty = p.y.toFixed(1);
        el.dataset.ptSource = String(i);
        // 換頁在收的時候字先退掉，只剩那一點
        const show = p.hidden || section.classList.contains('is-leaving') ? 0 : (glow[i] ?? 0);
        el.style.opacity = String(show);
        el.classList.toggle('is-on', show > 0.6);
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      setSatelliteGlow([]);
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      section.removeEventListener('pointerdown', onTap);
      section.removeEventListener('focusin', onFocusIn);
      section.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <section ref={sectionRef} className={`horbit${flat ? ' is-flat' : ''}`} aria-labelledby="horbit-title">
      <h1 id="horbit-title" className="sr-only">
        {t('home.orbit.title')}
      </h1>
      <nav className="horbit-labels" aria-labelledby="horbit-title">
        {MAIN_SECTIONS.map((s, i) => {
          const info = lines[s.key];
          return (
            <LocaleLink
              key={s.key}
              to={s.to}
              className="horbit-label"
              ref={(el: HTMLAnchorElement | null) => {
                labelsRef.current[i] = el;
              }}
            >
              <span className="l1">
                <span className="zh">{t(`siteNav.${s.key}`)}</span>
                <span className="en">{s.caps}</span>
              </span>
              {info?.line && <span className="line">{info.line}</span>}
              {info?.n && <span className="n">{info.n}</span>}
            </LocaleLink>
          );
        })}
      </nav>
    </section>
  );
}
