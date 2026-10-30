// 首頁門面（2026-10 翻新，提案的 B）：五個分區是繞著土星轉的五顆衛星。
//
// 土星、軌道與衛星都是 3D 背景裡的東西（lib/starfieldGpu 的 buildSaturn）。這裡只放字：每顆衛星
// 一個常駐的小標註（英文名，像星圖上的標註），加上一張字卡（名字、最新一則、數字）。字卡平常看不見，
// 滑鼠靠近那顆衛星、或鍵盤停在那個連結上才浮出來，標註同時讓位；亮度也送回 3D，那條軌道與那顆衛星
// 跟著亮。閒著的時候，偶爾有一顆自己亮一下。窄畫面的字卡放在土星下方，不貼著衛星；
// 摺疊機摺起來時星球本體在一半（書本式左半、筆電式上半，外圈軌道照樣越過摺痕），另一半是五個分區的
// 目錄：像攤開的書，一頁是插圖、一頁是目錄。靠近哪顆衛星（或滑過、聚焦哪一列），那一列才展開最新一則。
// 字的位置每幀跟著 3D 送來的衛星位置走（store/homeOrbit）。
//
// 沒有 3D 的時候（手機、沒有硬體加速）收不到位置，五個連結就直接排成一欄。
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocaleLink } from '@/i18n/locale-link';
import { MAIN_SECTIONS } from '@/data/siteSections';
import { useAboutContent } from '@/data/pageContent';
import { useWorkEntries } from '@/data/works';
import { useEnabledSections, useSiteConfig } from '@/data/siteConfig';
import { homeDigestQueryOptions, siteStatsQueryOptions } from '@/data/homeData';
import { watchStatsQueryOptions } from '@/data/watchData';
import { saturnFrame } from '@/lib/saturnSpec';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { currentFold, subscribeFold, type Fold } from '@/lib/viewportFold';
import { isTallMedium } from '@/lib/viewportShape';
import {
  absNow,
  collapseSaturnTo,
  setSatelliteGlow,
  subscribeSatellites,
  type SatelliteScreen,
} from '@/store/homeOrbit';
import { after, type Pt } from '@/store/pageTransition';
import FoldIndex from '@/components/common/FoldIndex';
import { useFoldPose } from '@/hooks/useFoldPose';
import { usePageTransition } from '@/hooks/usePageTransition';
import './HomeOrbit.css';

/** 滑鼠離衛星多近才算「靠近」（CSS 像素） */
const NEAR_PX = 72;
/** 閒置多久之後開始輪流提示 */
const IDLE_HINT_MS = 2500;
/** 每顆提示多久 */
const HINT_MS = 6500;
/** 軌道在畫面上是扁的（寬約是高的 2.5 倍）：算「往外」的方向前先把縱向拉回圓的 */
const ORBIT_FLAT = 2.5;
/** 字離衛星多遠 */
const GAP_X = 18;
const GAP_Y = 12;
/** 常駐小標註離衛星多遠 */
const TAG_GAP_X = 10;
const TAG_GAP_Y = 7;
/** 比這窄的畫面，浮出來的那張字卡放在土星下方的空白，不貼著衛星（手機上貼著會壓到軌道） */
const NARROW_PX = 640;
const pad2 = (n: number) => String(n).padStart(2, '0');
/**
 * 多久沒收到 3D 送來的位置就當作沒有 3D。GPU 探測確定是軟體渲染時（html.no-gpu，見 SpaceBackdropShell）
 * 不用等：3D 不會來。實地資料（2026-10）裡沒有 3D 的手機，首頁的 LCP 就是這排連結，中位數 4.6 秒，
 * 大半是在等這 2.5 秒
 */
const FLAT_AFTER_MS = 2500;
/** 字的位置最多往前推算多久（3D 送來的位置晚到或沒到的那幾幀用速度補） */
const PREDICT_MAX_MS = 50;
/** 字卡、小標註透明之後還要再跟幾毫秒：淡出的轉場（HomeOrbit.css 的 0.3 秒）跑完之前它還看得到 */
const FADE_OUT_MS = 400;
/** 換頁時土星收進衛星的時間（跟 lib/starfieldGpu 的 COLLAPSE_S 一樣） */
const SATURN_COLLAPSE_MS = 500;

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
  const tagsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const indexRef = useRef<(HTMLLIElement | null)[]>([]);
  // 開著的主要分區，由內到外對應土星的軌道：關掉一個，最外圈那條收起來、後面的往內遞補（見 starfieldGpu 的 setSections）
  const main = useEnabledSections(MAIN_SECTIONS);
  const { author } = useSiteConfig();
  // 作品：照建立時間由新到舊（用最後量到的數字，首頁不等 GitHub）
  const works = useWorkEntries();
  const newestWorks = [...works]
    .sort((a, b) => b.fallback.created_at.localeCompare(a.fallback.created_at))
    .map((w) => w.name);
  const firstYear = /\d{4}/.exec(useAboutContent().chapters[0]?.year ?? '')?.[0];
  // 摺起來（CSS 的 viewport-segments）：浮動字卡換成另一半的目錄（common/FoldIndex）
  const folded = useFoldPose() !== null;
  const [flat, setFlat] = useState(false);
  /** 衛星在畫面上的位置與速度（px/ms），轉場的「收」要用 */
  const positionsRef = useRef<SatelliteScreen[]>([]);
  const velocityRef = useRef<Pt[]>([]);

  // 換頁轉場：首頁的錨點是土星的中心。換進來時點飛到這裡、土星從這一點撐開（3D 那邊自己長，
  // 見 StarfieldGpu），所以「長」由首頁接手。換出去時整組收進點下去的那顆衛星，點順著那顆衛星的
  // 軌道方向飛出去；從導覽列或上一頁離開就收進土星中心
  const center = (): Pt => {
    const f = saturnFrame(window.innerWidth, window.innerHeight, currentFold());
    return { x: f.x, y: f.y };
  };
  usePageTransition({
    anchor: center,
    leave: ({ source, to }) => {
      // 3D 沒跑起來（平面的備案）：沒有土星可以收，交給預設的遮罩
      if (flat) return null;
      // 點衛星時連結自己報了序號；上一頁、下一頁沒有，就照要去的那一頁找那顆衛星
      const i =
        source !== null
          ? Number(source)
          : main.findIndex((s) => to === s.to.slice(1) || to.startsWith(`${s.to.slice(1)}/`));
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
  });

  const post = digest?.posts[0];
  const thought = digest?.thoughts[0];
  const short = (s: string) => dotDate(parseServerDate(s), true);
  const watchTotal = watch ? watch.animeCount + watch.filmCount + watch.tvSeriesCount : 0;
  const lines: Partial<Record<string, { line: string; n: string }>> = {
    notes: {
      line: post ? clip(post.title.split(/[：:]\s?/)[0] ?? post.title, 26) : '',
      n: stats && post ? t('home.orbit.notesCount', { count: stats.total_posts, date: short(post.created_at) }) : '',
    },
    moments: {
      line: thought ? clip(thought.content, 24) : '',
      n: thought ? t('home.orbit.momentsCount', { date: short(thought.created_at) }) : '',
    },
    works: newestWorks.length
      ? {
          line: `${newestWorks.slice(0, 3).join('、')}${newestWorks.length > 3 ? '⋯' : ''}`,
          n: t('home.orbit.worksCount', { count: newestWorks.length }),
        }
      : { line: '', n: '' },
    // 一部都沒有（新站、沒接 Simkl）就跟其他幾顆一樣留白，不寫「在看 0 部動畫…」
    collection:
      watch && watchTotal > 0
        ? {
            line: t('home.orbit.collectionLine', {
              anime: watch.animeCount,
              films: watch.filmCount,
              series: watch.tvSeriesCount,
            }),
            n: String(watchTotal),
          }
        : { line: '', n: '' },
    // 第一章的年份（關於頁沒填就不寫）
    about: firstYear
      ? { line: t('home.orbit.aboutLine', { year: firstYear }), n: t('home.orbit.aboutCount', { year: firstYear }) }
      : { line: '', n: '' },
  };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const count = main.length;
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
    // 字卡與小標註最後一次看得到（透明度大於 0）是什麼時候：整個淡出之後就不再每幀擺位置。
    // 每一幀改它們的樣式，瀏覽器就得重算那些元素的樣式；五張字卡、五個小標註加上字卡裡的每一行，
    // 在慢手機上一幀要好幾毫秒（CPU 降速 4 倍時首頁閒置只剩 20fps），而字卡大部分時間是透明的
    const labelLitAt: number[] = [];
    const tagLitAt: number[] = [];
    /** 上一次寫進去的值：值沒變就不再寫 */
    const written = new WeakMap<HTMLElement, Partial<Record<'transform' | 'translate' | 'opacity', string>>>();
    const setStyle = (el: HTMLElement, prop: 'transform' | 'translate' | 'opacity', value: string) => {
      let last = written.get(el);
      if (!last) {
        last = {};
        written.set(el, last);
      }
      if (last[prop] === value) return;
      last[prop] = value;
      el.style[prop] = value;
    };
    let fold: Fold | null = currentFold();
    const unsubscribeFold = subscribeFold(() => {
      fold = currentFold();
    });

    /** 收到的這組位置是 3D 在哪個時間點算的（store/homeOrbit 的 absNow 時基） */
    let positionsAt = 0;
    const unsubscribe = subscribeSatellites((next, at) => {
      const prev = positionsRef.current;
      // 速度照 3D 算位置的時間差算，不照訊息到達的時間：訊息有時一幀到兩筆、有時一筆都沒有
      if (next.length && prev.length === next.length && at > positionsAt) {
        velocityRef.current = next.map((p, i) => ({
          x: (p.x - prev[i].x) / (at - positionsAt),
          y: (p.y - prev[i].y) / (at - positionsAt),
        }));
      }
      positions = next;
      positionsRef.current = next;
      if (next.length) {
        lastPositionsAt = performance.now();
        positionsAt = at;
      }
    });

    /** 指到（聚焦）的是第幾顆的字卡或目錄那一列 */
    const indexOf = (target: EventTarget | null) => {
      const el = (target as Element | null)?.closest<HTMLElement>('.horbit-label, .horbit-index-a');
      return el?.dataset.ptSource ? Number(el.dataset.ptSource) : -1;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer = [e.clientX, e.clientY];
      lastInput = performance.now();
      // 從衛星移到字上會離開「靠近」的範圍：指在字上的時候那顆要一直亮著，字才點得到
      hovered = indexOf(e.target);
    };
    const onLeave = () => {
      pointer = null;
      hovered = -1;
    };
    // 觸控沒有「靠近」：點一下畫面就依序指到下一顆（點到字本身就照常進那一頁）
    const onTap = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as Element).closest('.horbit-label, .horbit-tag, .horbit-index'))
        return;
      tapped = (tapped + 1) % count;
      lastInput = performance.now();
    };
    const onFocusIn = (e: FocusEvent) => {
      const i = indexOf(e.target);
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
      const noGpu = document.documentElement.classList.contains('no-gpu');
      const nextFlat = !live && (noGpu || now - lastPositionsAt > FLAT_AFTER_MS);
      if (nextFlat !== flatNow) {
        flatNow = nextFlat;
        setFlat(nextFlat);
      }
      if (!live) return;
      // 字跟著衛星：3D 在 worker 裡畫，位置傳過來時已經晚了一點，而且跟這邊的幀不同步（有的幀收到兩筆、
      // 有的一筆也沒有），照收到的位置擺字會一停一跳。照速度推算到這一幀的時間，字就跟畫面上的衛星對齊。
      // 最多推 PREDICT_MAX_MS：3D 停下來（分頁切走、收起來）時字不會自己飄走
      const ahead = Math.min(PREDICT_MAX_MS, Math.max(0, absNow() - positionsAt));
      const shown = positions.map((p, i) => {
        const v = velocityRef.current[i] as Pt | undefined;
        return v ? { ...p, x: p.x + v.x * ahead, y: p.y + v.y * ahead } : p;
      });

      let near = focused >= 0 ? focused : hovered >= 0 ? hovered : tapped;
      if (near < 0 && pointer) {
        const [px, py] = pointer;
        let best = NEAR_PX;
        shown.forEach((p, i) => {
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
        hintLevel = Math.max(0, Math.sin(Math.min(1, (k % 1) / 0.7) * Math.PI)) * 0.5;
      } else hintStart = 0;

      const glow = Array.from({ length: count }, (_, i) => (i === near ? 1 : i === hint ? hintLevel : 0));
      setSatelliteGlow(glow);

      const box = section.getBoundingClientRect();
      // 字往外長的方向以土星為中心。攤平時照原本的畫面中心（土星在 46% 時差一點，看不出來）
      const sat = fold ? saturnFrame(window.innerWidth, window.innerHeight, fold) : null;
      const cx = sat ? sat.x : window.innerWidth / 2;
      const cy = sat ? sat.y : window.innerHeight / 2;
      // 摺疊機直拿（中等寬度的直式）也照窄畫面排：土星提到摺痕以上，字卡放到下面那片空白。
      // 摺起來時字卡不出來（換成目錄），小標註照窄畫面一直掛著
      const narrow =
        fold !== null || window.innerWidth < NARROW_PX || isTallMedium(window.innerWidth, window.innerHeight);
      const leaving = section.classList.contains('is-leaving');
      // 尺寸先一次量完再寫：讀寫交錯的話，每讀一次 offsetWidth 瀏覽器就得把前一顆剛寫的樣式排一次版，
      // 一幀重排十幾次；換頁時整頁正在換，每一次都是整頁的排版（CPU 降速 4 倍時一幀 80–115ms）。
      // 這裡寫的 transform、translate、opacity、is-on（只改 pointer-events）都不影響尺寸，量到的跟交錯時一樣
      const sizes = shown.map((_, i) => {
        const el = labelsRef.current[i];
        const tag = tagsRef.current[i];
        return {
          w: el?.offsetWidth ?? 0,
          h: el?.offsetHeight ?? 0,
          lines: el ? [...el.children].map((line) => (line instanceof HTMLElement ? line.offsetWidth : 0)) : [],
          tw: tag?.offsetWidth ?? 0,
          th: tag?.offsetHeight ?? 0,
        };
      });
      shown.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        const size = sizes[i];
        // 字往「遠離土星」的方向長，不壓在軌道與土星上。錨點跟著衛星繞土星的角度連續地變：
        // 在右邊時字從點的右側開始、在左邊時字結束在點的左側、在正下方時字置中在點下面——
        // 衛星怎麼走字就怎麼跟，不會在某個位置突然被推到另一邊
        const dx = p.x - cx;
        const dy = (p.y - cy) * ORBIT_FLAT;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        /** 字有幾成落在點的左邊（上面）：0 是整個在右（下），1 是整個在左（上） */
        const fx = narrow ? 0.5 : 0.5 - 0.5 * ux;
        const fy = 0.5 - 0.5 * uy;
        const { w, h } = size;
        let x = p.x + ux * GAP_X - w * fx;
        let y = p.y + uy * GAP_Y - h * fy;
        // 窄畫面：軌道幾乎佔滿寬度，貼著衛星一定壓到軌道。字卡放到土星下方那片空白、置中，
        // 是哪一顆由 3D 那邊亮起來的衛星與軌道指出來
        if (narrow) {
          x = cx - w / 2;
          y = center().y + Math.min(window.innerHeight * 0.24, 220);
        }
        x = Math.max(16, Math.min(window.innerWidth - w - 16, x));
        y = Math.max(72, Math.min(window.innerHeight - h - 16, y));
        const tx = p.x.toFixed(1);
        const ty = p.y.toFixed(1);
        // 目錄那一列：換頁的點也從那顆衛星出發；靠近的那一列展開，閒置提示只讓它亮一下
        const row = indexRef.current[i];
        if (row) {
          const a = row.firstElementChild as HTMLElement | null;
          if (a) {
            a.dataset.tx = tx;
            a.dataset.ty = ty;
          }
          row.classList.toggle('is-on', i === near);
          row.classList.toggle('is-hint', i === hint && hintLevel > 0.2);
        }
        // 換頁在收的時候字先退掉，只剩那一點；摺起來時字卡換成目錄
        const show = p.hidden || leaving || fold ? 0 : (glow[i] ?? 0);
        if (show > 0) labelLitAt[i] = now;
        // 整個淡出的字卡不跟：要再浮出來的那一幀，位置跟透明度一起寫，淡入就從對的位置開始
        if (now - (labelLitAt[i] ?? -Infinity) <= FADE_OUT_MS) {
          // 每一行也照同一個比例對齊（在右邊靠左、在左邊靠右、在下面置中），一樣是連續變的
          for (const [k, line] of [...el.children].entries()) {
            if (line instanceof HTMLElement)
              setStyle(line, 'translate', `${((w - (size.lines[k] ?? 0)) * fx).toFixed(1)}px 0`);
          }
          setStyle(el, 'transform', `translate(${x - box.left}px, ${y - box.top}px)`);
          el.dataset.tx = tx;
          el.dataset.ty = ty;
        }
        setStyle(el, 'opacity', String(show));
        el.classList.toggle('is-on', show > 0.6);

        // 常駐的小標註：像星圖上的標註，讓第一次來的人一眼看出有五個地方可以去。
        // 字卡浮出來的時候它讓位（交叉淡出），衛星轉到土星後面時跟著藏起來
        const tag = tagsRef.current[i];
        if (!tag) return;
        const { tw, th } = size;
        // 字卡一開始浮出，小標註就整個讓位（它自己有 0.3 秒的淡出）。照字卡亮度按比例退的話，
        // 閒置提示的字卡只亮到一半，標註還剩兩成，兩個疊在一起
        const tagShow = p.hidden || leaving || (!narrow && show > 0.01) ? 0 : 1;
        if (tagShow > 0) tagLitAt[i] = now;
        if (now - (tagLitAt[i] ?? -Infinity) <= FADE_OUT_MS) {
          const gx = Math.max(8, Math.min(window.innerWidth - tw - 8, p.x + ux * TAG_GAP_X - tw * (0.5 - 0.5 * ux)));
          const gy = Math.max(64, Math.min(window.innerHeight - th - 8, p.y + uy * TAG_GAP_Y - th * fy));
          setStyle(tag, 'transform', `translate(${gx - box.left}px, ${gy - box.top}px)`);
        }
        setStyle(tag, 'opacity', String(tagShow));
        tag.classList.toggle('is-on', tagShow > 0.5);
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      unsubscribeFold();
      setSatelliteGlow([]);
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      section.removeEventListener('pointerdown', onTap);
      section.removeEventListener('focusin', onFocusIn);
      section.removeEventListener('focusout', onFocusOut);
    };
    // 分區數變了（站台設定開關）就重新掛一次：衛星的序號與字卡的數量都跟著換
  }, [main.length]);

  return (
    <section
      ref={sectionRef}
      className={`horbit${flat ? ' is-flat' : ''}${folded && !flat ? ' is-folded' : ''}`}
      aria-labelledby="horbit-title"
    >
      <h1 id="horbit-title" className="sr-only">
        {t('home.orbit.title', { author })}
      </h1>
      <nav className="horbit-labels" aria-labelledby="horbit-title">
        {main.map((s, i) => {
          const info = lines[s.key];
          return (
            <LocaleLink
              key={s.key}
              to={s.to}
              className="horbit-label"
              data-pt-source={i}
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
        {/* 常駐小標註：同一個連結的第二個點擊區（觸控可以直接點），對輔助技術藏起來，免得同一個連結念兩次 */}
        {main.map((s, i) => (
          <LocaleLink
            key={`tag-${s.key}`}
            to={s.to}
            className="horbit-tag"
            tabIndex={-1}
            aria-hidden="true"
            ref={(el: HTMLAnchorElement | null) => {
              tagsRef.current[i] = el;
            }}
          >
            {s.caps}
          </LocaleLink>
        ))}
        {/* 摺起來時另一半的目錄（沒有 3D 的平面備案本來就是一欄連結，不另外放） */}
        {!flat && (
          <FoldIndex className="horbit-index">
            {main.map((s, i) => {
              const info = lines[s.key];
              return (
                <li
                  key={s.key}
                  ref={(el) => {
                    indexRef.current[i] = el;
                  }}
                >
                  <LocaleLink to={s.to} className="horbit-index-a" data-pt-source={i}>
                    <span className="no">{pad2(i + 1)}</span>
                    <span className="zh">{t(`siteNav.${s.key}`)}</span>
                    <span className="en">{s.caps}</span>
                    <span className="more">
                      <span>
                        {info?.line && <span className="line">{info.line}</span>}
                        {info?.n && <span className="n">{info.n}</span>}
                      </span>
                    </span>
                  </LocaleLink>
                </li>
              );
            })}
          </FoldIndex>
        )}
      </nav>
    </section>
  );
}
