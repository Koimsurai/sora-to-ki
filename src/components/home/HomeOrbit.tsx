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
//
// 瀏覽器有 HTML-in-Canvas（Chrome 157 起）時，字卡與常駐小標註改成畫進 3D 那一層（store/canvasLabels）：
// 它們 portal 進那張 canvas，位置與淡入淡出由 worker 跟著衛星在同一幀畫（lib/labelOverlay），
// 這裡每幀只算哪一顆亮著。擺法兩邊共用 lib/orbitLabels。網址帶 ?hic=0 一律走 DOM（A/B 比較用）。
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocaleLink } from '@/i18n/locale-link';
import { MAIN_SECTIONS } from '@/data/siteSections';
import { useAboutContent } from '@/data/pageContent';
import { useWorkEntries } from '@/data/works';
import { useEnabledSections, useSiteConfig } from '@/data/siteConfig';
import { homeDigestQueryOptions, siteStatsQueryOptions } from '@/data/homeData';
import { watchStatsQueryOptions } from '@/data/watchData';
import { transitionValue, type TransitionValue } from '@/lib/cssTransition';
import { cardAt, cardShow, LABEL_FADE_MS, orbitFrame, tagAt, tagShow } from '@/lib/orbitLabels';
import { saturnFrame } from '@/lib/saturnSpec';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { currentFold, subscribeFold, type Fold } from '@/lib/viewportFold';
import {
  absNow,
  collapseSaturnTo,
  setSatelliteGlow,
  subscribeSatellites,
  type SatelliteScreen,
} from '@/store/homeOrbit';
import { attachLabels, canvasHost, setLabelShow, subscribeCanvasHost } from '@/store/canvasLabels';
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
  // 字卡與標註畫進 3D 的那張 canvas（接上了才有；伺服器端與不支援的瀏覽器是 null）
  const labelHost = useSyncExternalStore(subscribeCanvasHost, canvasHost, () => null);
  // 3D 沒跑起來（平面的備案）時字照舊是頁面上的一欄連結
  const host = flat ? null : labelHost;
  const drawn = host !== null;
  useEffect(() => {
    if (!drawn) return;
    // 序號就是衛星的序號：少一個都對不上，等全部掛好
    const cards = labelsRef.current.slice(0, main.length);
    const tags = tagsRef.current.slice(0, main.length);
    const all = [...cards, ...tags];
    if (all.length < main.length * 2 || all.some((el) => !el)) return;
    return attachLabels(cards as HTMLAnchorElement[], tags as HTMLAnchorElement[]);
  }, [drawn, host, main.length]);

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
    /** 字卡透明度的轉場，照 CSS 的規則在這裡算（lib/cssTransition） */
    const labelFade: TransitionValue[] = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
      const el = (target as Element | null)?.closest<HTMLElement>('.horbit-label, .horbit-proxy, .horbit-index-a');
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
    // 字畫進 canvas 時，這一整片要讓滑鼠穿過去（canvas 在它底下，畫出來的字才點得到）。
    // 「靠近」、點一下與焦點改在整份文件上聽；指到的是導覽列之類別的東西就不算
    const pointerRoot: HTMLElement | Document = drawn ? document : section;
    const onPage = (target: EventTarget | null) =>
      !drawn ||
      (target instanceof Node &&
        (section.contains(target) ||
          target === document.body ||
          target === document.documentElement ||
          host.contains(target)));
    // 觸控沒有「靠近」：點一下畫面就依序指到下一顆（點到字本身就照常進那一頁）
    const onTap = (e: PointerEvent) => {
      if (
        e.pointerType === 'mouse' ||
        !onPage(e.target) ||
        (e.target as Element).closest('.horbit-label, .horbit-tag, .horbit-index')
      )
        return;
      tapped = (tapped + 1) % count;
      lastInput = performance.now();
    };
    // 字卡畫進 canvas 時，鍵盤停的是頁面上看不見的那份連結（.horbit-proxy，順序與輔助技術照舊）；
    // 焦點外框改畫在 canvas 裡那張字卡上（.is-focus，HomeOrbit.css）
    const onFocusIn = (e: FocusEvent) => {
      const i = indexOf(e.target);
      if (i >= 0) focused = i;
      if (drawn && e.target instanceof Element && e.target.matches('.horbit-proxy:focus-visible'))
        labelsRef.current[i]?.classList.add('is-focus');
    };
    const onFocusOut = () => {
      focused = -1;
      for (const el of labelsRef.current) el?.classList.remove('is-focus');
    };
    // 換頁的點從哪裡出發（layout/TransitionLayer 點下去時讀 data-tx）。字畫進 canvas 時這裡不再每幀寫，
    // 按下去的那一刻才寫：字卡與目錄從那顆衛星出發，標註從點到的地方（跟它在頁面上時一樣）
    const onPress = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-pt-source]');
      const p = el ? (positionsRef.current[Number(el.dataset.ptSource)] as SatelliteScreen | undefined) : undefined;
      if (!el || !p) return;
      const at = el.classList.contains('horbit-tag') && e instanceof PointerEvent ? { x: e.clientX, y: e.clientY } : p;
      el.dataset.tx = at.x.toFixed(1);
      el.dataset.ty = at.y.toFixed(1);
    };
    const leaveRoot = drawn ? document.documentElement : section;
    pointerRoot.addEventListener('pointermove', onMove as EventListener);
    leaveRoot.addEventListener('pointerleave', onLeave);
    pointerRoot.addEventListener('pointerdown', onTap as EventListener);
    section.addEventListener('focusin', onFocusIn);
    section.addEventListener('focusout', onFocusOut);
    if (drawn) {
      document.addEventListener('pointerdown', onPress, true);
      document.addEventListener('keydown', onPress, true);
    }

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

      // 摺疊機直拿（中等寬度的直式）也照窄畫面排；摺起來時字卡不出來（換成目錄），小標註照窄畫面一直掛著
      const o = orbitFrame(window.innerWidth, window.innerHeight, fold);
      const leaving = section.classList.contains('is-leaving');
      // 目錄那一列：靠近的那一列展開，閒置提示只讓它亮一下
      for (const [i, row] of indexRef.current.entries()) {
        if (!row || i >= count) continue;
        row.classList.toggle('is-on', i === near);
        row.classList.toggle('is-hint', i === hint && hintLevel > 0.2);
      }
      // 字畫進 canvas：位置與淡入淡出都交給 worker（lib/labelOverlay），這裡只說哪一顆亮著，
      // 再照同一套規則開關點擊（.is-on 只改 pointer-events）。不量尺寸、不寫樣式
      if (drawn) {
        setLabelShow({ glow, leaving, still: reduceMotion.matches });
        shown.forEach((p, i) => {
          const show = cardShow(glow[i] ?? 0, p.hidden, leaving, o);
          labelsRef.current[i]?.classList.toggle('is-on', show > 0.6);
          tagsRef.current[i]?.classList.toggle('is-on', tagShow(show, p.hidden, leaving, o) > 0.5);
        });
        return;
      }
      const box = section.getBoundingClientRect();
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
        const { w } = size;
        const { x, y, fx } = cardAt(p, size, o);
        const tx = p.x.toFixed(1);
        const ty = p.y.toFixed(1);
        // 目錄那一列：換頁的點也從那顆衛星出發
        const a = indexRef.current[i]?.firstElementChild as HTMLElement | null | undefined;
        if (a) {
          a.dataset.tx = tx;
          a.dataset.ty = ty;
        }
        // 換頁在收的時候字先退掉，只剩那一點；摺起來時字卡換成目錄
        const show = cardShow(glow[i] ?? 0, p.hidden, leaving, o);
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
        // 透明度照 CSS 的 0.3 秒 ease 轉場算好再寫，字卡本身不帶 transition（HomeOrbit.css）：閒置提示讓目標
        // 每一幀都在變，交給 CSS 的話每一幀都要取消舊的轉場、建新的，CPU 降速 4 倍時光這件事每秒約 200ms。
        // 算法跟瀏覽器的一樣（含中途改目標、反轉縮短），逐幀比對 Chrome 自己跑的值，差不到 8 位元的一階
        let fade = labelFade[i] as TransitionValue | undefined;
        if (!fade) {
          fade = transitionValue(0);
          labelFade[i] = fade;
        }
        fade.set(show, now, reduceMotion.matches ? 0 : LABEL_FADE_MS);
        setStyle(el, 'opacity', String(fade.at(now)));
        el.classList.toggle('is-on', show > 0.6);

        // 常駐的小標註：像星圖上的標註，讓第一次來的人一眼看出有五個地方可以去。
        // 字卡浮出來的時候它讓位（交叉淡出），衛星轉到土星後面時跟著藏起來
        const tag = tagsRef.current[i];
        if (!tag) return;
        const tagOn = tagShow(show, p.hidden, leaving, o);
        if (tagOn > 0) tagLitAt[i] = now;
        if (now - (tagLitAt[i] ?? -Infinity) <= FADE_OUT_MS) {
          const g = tagAt(p, { w: size.tw, h: size.th }, o);
          setStyle(tag, 'transform', `translate(${g.x - box.left}px, ${g.y - box.top}px)`);
        }
        setStyle(tag, 'opacity', String(tagOn));
        tag.classList.toggle('is-on', tagOn > 0.5);
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      unsubscribeFold();
      setSatelliteGlow([]);
      pointerRoot.removeEventListener('pointermove', onMove as EventListener);
      leaveRoot.removeEventListener('pointerleave', onLeave);
      pointerRoot.removeEventListener('pointerdown', onTap as EventListener);
      section.removeEventListener('focusin', onFocusIn);
      section.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('keydown', onPress, true);
    };
    // 分區數變了（站台設定開關）就重新掛一次：衛星的序號與字卡的數量都跟著換。
    // 標註改畫進 canvas（或退回 DOM）時也是：聽的地方與標註怎麼擺都不一樣了
  }, [main.length, drawn, host]);

  const cardText = (s: (typeof main)[number]) => {
    const info = lines[s.key];
    return (
      <>
        <span className="l1">
          <span className="zh">{t(`siteNav.${s.key}`)}</span>
          <span className="en">{s.caps}</span>
        </span>
        {info?.line && <span className="line">{info.line}</span>}
        {info?.n && <span className="n">{info.n}</span>}
      </>
    );
  };
  // 畫進 canvas 的字卡只負責被看見與被點：鍵盤與輔助技術走頁面上那份看不見的連結（下面的 .horbit-proxy），
  // 不然 Tab 會先停在 canvas 裡（它在導覽列之前），導覽的語意也會少掉這五個連結
  const cards = main.map((s, i) => (
    <LocaleLink
      key={s.key}
      to={s.to}
      className={drawn ? 'horbit-label is-drawn' : 'horbit-label'}
      data-pt-source={i}
      tabIndex={drawn ? -1 : undefined}
      aria-hidden={drawn ? 'true' : undefined}
      drawable={drawn ? '' : undefined}
      ref={(el: HTMLAnchorElement | null) => {
        labelsRef.current[i] = el;
      }}
    >
      {cardText(s)}
    </LocaleLink>
  ));
  const tags = main.map((s, i) => (
    <LocaleLink
      key={`tag-${s.key}`}
      to={s.to}
      className={drawn ? 'horbit-tag is-drawn' : 'horbit-tag'}
      data-pt-source={i}
      tabIndex={-1}
      aria-hidden="true"
      drawable={drawn ? '' : undefined}
      ref={(el: HTMLAnchorElement | null) => {
        tagsRef.current[i] = el;
      }}
    >
      {s.caps}
    </LocaleLink>
  ));

  return (
    <section
      ref={sectionRef}
      className={`horbit${flat ? ' is-flat' : ''}${folded && !flat ? ' is-folded' : ''}${drawn && !flat ? ' is-drawn' : ''}`}
      aria-labelledby="horbit-title"
    >
      <h1 id="horbit-title" className="sr-only">
        {t('home.orbit.title', { author })}
      </h1>
      <nav className="horbit-labels" aria-labelledby="horbit-title">
        {host ? createPortal(cards, host) : cards}
        {drawn &&
          main.map((s, i) => (
            <LocaleLink key={`proxy-${s.key}`} to={s.to} className="horbit-proxy sr-only" data-pt-source={i}>
              {cardText(s)}
            </LocaleLink>
          ))}
        {/* 常駐小標註：同一個連結的第二個點擊區（觸控可以直接點），對輔助技術藏起來，免得同一個連結念兩次。
            畫進 3D 時 portal 進那張 canvas（store/canvasLabels） */}
        {host ? createPortal(tags, host) : tags}
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
