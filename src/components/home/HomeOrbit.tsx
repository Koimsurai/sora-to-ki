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
import { homeDigestQueryOptions, siteStatsQueryOptions } from '@/data/homeData';
import { watchStatsQueryOptions } from '@/data/watchData';
import { saturnFrame } from '@/lib/saturnSpec';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { currentFold, subscribeFold, type Fold } from '@/lib/viewportFold';
import { isTallMedium } from '@/lib/viewportShape';
import { collapseSaturnTo, setSatelliteGlow, subscribeSatellites, type SatelliteScreen } from '@/store/homeOrbit';
import { after, type Pt } from '@/store/pageTransition';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePageTransition } from '@/hooks/usePageTransition';
import './HomeOrbit.css';

/** 作品頁做好之前，衛星上先列這幾個（照提案的作品清單） */
const WORKS = ['tessera', 'nuntius', 'anigamer-rs', 'session-to-obsidian', 'flow2code', 'sora-to-ki', 'VoltiCar'];
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
/** 多久沒收到 3D 送來的位置就當作沒有 3D */
const FLAT_AFTER_MS = 2500;
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
  // 摺起來（CSS 的 viewport-segments）：浮動字卡換成另一半的目錄
  const book = useMediaQuery('(horizontal-viewport-segments: 2)');
  const laptop = useMediaQuery('(vertical-viewport-segments: 2)');
  const folded = book || laptop;
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
          : MAIN_SECTIONS.findIndex((s) => to === s.to.slice(1) || to.startsWith(`${s.to.slice(1)}/`));
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
    let fold: Fold | null = currentFold();
    const unsubscribeFold = subscribeFold(() => {
      fold = currentFold();
    });

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
        hintLevel = Math.max(0, Math.sin(Math.min(1, (k % 1) / 0.7) * Math.PI)) * 0.5;
      } else hintStart = 0;

      const glow = MAIN_SECTIONS.map((_, i) => (i === near ? 1 : i === hint ? hintLevel : 0));
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
      positions.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
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
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let x = p.x + ux * GAP_X - w * fx;
        let y = p.y + uy * GAP_Y - h * fy;
        // 窄畫面：軌道幾乎佔滿寬度，貼著衛星一定壓到軌道。字卡放到土星下方那片空白、置中，
        // 是哪一顆由 3D 那邊亮起來的衛星與軌道指出來
        if (narrow) {
          x = cx - w / 2;
          y = center().y + Math.min(window.innerHeight * 0.24, 220);
        }
        // 每一行也照同一個比例對齊（在右邊靠左、在左邊靠右、在下面置中），一樣是連續變的
        for (const line of el.children) {
          if (line instanceof HTMLElement) line.style.translate = `${((w - line.offsetWidth) * fx).toFixed(1)}px 0`;
        }
        x = Math.max(16, Math.min(window.innerWidth - w - 16, x));
        y = Math.max(72, Math.min(window.innerHeight - h - 16, y));
        el.style.transform = `translate(${x - box.left}px, ${y - box.top}px)`;
        el.dataset.tx = p.x.toFixed(1);
        el.dataset.ty = p.y.toFixed(1);
        // 目錄那一列：換頁的點也從那顆衛星出發；靠近的那一列展開，閒置提示只讓它亮一下
        const row = indexRef.current[i];
        if (row) {
          const a = row.firstElementChild as HTMLElement | null;
          if (a) {
            a.dataset.tx = el.dataset.tx;
            a.dataset.ty = el.dataset.ty;
          }
          row.classList.toggle('is-on', i === near);
          row.classList.toggle('is-hint', i === hint && hintLevel > 0.2);
        }
        // 換頁在收的時候字先退掉，只剩那一點；摺起來時字卡換成目錄
        const show = p.hidden || leaving || fold ? 0 : (glow[i] ?? 0);
        el.style.opacity = String(show);
        el.classList.toggle('is-on', show > 0.6);

        // 常駐的小標註：像星圖上的標註，讓第一次來的人一眼看出有五個地方可以去。
        // 字卡浮出來的時候它讓位（交叉淡出），衛星轉到土星後面時跟著藏起來
        const tag = tagsRef.current[i];
        if (!tag) return;
        const tw = tag.offsetWidth;
        const th = tag.offsetHeight;
        const tx = Math.max(8, Math.min(window.innerWidth - tw - 8, p.x + ux * TAG_GAP_X - tw * (0.5 - 0.5 * ux)));
        const ty = Math.max(64, Math.min(window.innerHeight - th - 8, p.y + uy * TAG_GAP_Y - th * fy));
        tag.style.transform = `translate(${tx - box.left}px, ${ty - box.top}px)`;
        // 字卡一開始浮出，小標註就整個讓位（它自己有 0.3 秒的淡出）。照字卡亮度按比例退的話，
        // 閒置提示的字卡只亮到一半，標註還剩兩成，兩個疊在一起
        const tagShow = p.hidden || leaving || (!narrow && show > 0.01) ? 0 : 1;
        tag.style.opacity = String(tagShow);
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
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`horbit${flat ? ' is-flat' : ''}${folded && !flat ? ' is-folded' : ''}`}
      aria-labelledby="horbit-title"
    >
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
        {MAIN_SECTIONS.map((s, i) => (
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
        {folded && !flat && (
          <ol className="horbit-index">
            {MAIN_SECTIONS.map((s, i) => {
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
          </ol>
        )}
      </nav>
    </section>
  );
}
