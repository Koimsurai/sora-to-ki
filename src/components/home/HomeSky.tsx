// 首頁（新版 demo）。
// 第一屏只有三樣東西：左邊的名字與一句話、右邊的 3D 土星（鏡頭把它往右讓開，見 starfieldGpu 的 placeCamera）、
// 左下角兩行「此刻」。往下捲，土星升上天空、變遠，底下一扇一扇浮現「天空之窗」：
// 每一扇是那一區真正的天空縮影（手記的星軌與樹、碎念的像素、收藏的星座、關於的小星球），
// 點進去就飛到那一片天空。沒有 footer，最後一行是今天的一句話。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DigestThought } from '@koimsurai/api-types';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaRss, FaEnvelope, FaInstagram } from 'react-icons/fa';
import { LocaleLink } from '@/i18n/locale-link';
import { homeDigestQueryOptions, dailyQuoteQueryOptions } from '@/data/homeData';
import { postPath } from '@/lib/postPath';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import { COLLECTION_STARS, aboutSky, collectionSky, momentsSky, notesSky, type WindowSky } from '@/lib/windowSkies';
import './HomeSky.css';

/**
 * 一扇窗的天空。三層：back / front 是靜態的，快取在離屏 canvas、尺寸變了才重畫；
 * frame 每幀畫（限 sky.fps），只在窗出現在畫面上時才跑，滑出畫面就停。
 * 時間從窗第一次出現時算起（收藏的星座線是「出現之後才連起來」），hover 時走得比較快。
 */
function SkyCanvas({ sky }: { sky: WindowSky }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const host = cv?.parentElement;
    if (!cv || !ctx || !host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let back: HTMLCanvasElement | null = null;
    let front: HTMLCanvasElement | null = null;
    let t = 0;
    let last = -1;
    let raf = 0;
    let hover = false;

    const layer = (fn?: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
      if (!fn) return null;
      const c = document.createElement('canvas');
      c.width = cv.width;
      c.height = cv.height;
      const x = c.getContext('2d');
      if (!x) return null;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      fn(x, w, h);
      return c;
    };
    const paint = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (back) ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky.frame?.(ctx, w, h, t, hover);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (front) ctx.drawImage(front, 0, 0);
      if (sky.over) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sky.over(ctx, w, h, t, hover);
      }
    };
    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      back = layer(sky.back);
      front = layer(sky.front);
      paint();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last < 0) last = now;
      const dt = (now - last) / 1000;
      if (dt < 1 / sky.fps - 0.002) return;
      last = now;
      t += Math.min(dt, 0.1) * (hover ? sky.hoverSpeed : 1);
      paint();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      last = -1;
      if (e.isIntersecting && !reduce && (sky.frame || sky.over)) raf = requestAnimationFrame(loop);
    });
    io.observe(cv);
    const enter = () => (hover = true);
    const leave = () => (hover = false);
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
    };
  }, [sky]);
  return <canvas ref={ref} className="hw-sky" aria-hidden="true" />;
}

/**
 * 碎念窗的字：一則一則「閃過」。整句先亮一下（跟碎念頁的 tk-flash 同一個語言），
 * 字再一個一個浮現、從琥珀色冷卻成白色；過幾秒換下一則。
 */
function MomentFlash({ thoughts }: { thoughts: DigestThought[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (thoughts.length < 2) return;
    const id = setInterval(() => setIndex((v) => (v + 1) % thoughts.length), 7000);
    return () => clearInterval(id);
  }, [thoughts.length]);
  const thought = thoughts.at(index % Math.max(1, thoughts.length));
  if (!thought) return null;
  const chars = Array.from(plain(thought.content).slice(0, 72), (ch, pos) => ({ ch, pos }));
  return (
    <div className="hw-moment" key={thought.id}>
      <p className="hw-moment-text" aria-label={plain(thought.content)}>
        {chars.map((c) => (
          <span key={c.pos} aria-hidden="true" style={{ '--i': c.pos } as CSSProperties}>
            {c.ch}
          </span>
        ))}
      </p>
      <time className="hw-meta" dateTime={thought.created_at} suppressHydrationWarning>
        {thought.created_at.slice(0, 10).replaceAll('-', '.')}
      </time>
    </div>
  );
}

/** 捲到才浮現：一次一扇，不要一進來就全部都在 */
function useReveal(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

function plain(md: string) {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 離開首頁：往前飛（穿過土星）時字朝鏡頭衝過來、散掉；
 * 往下墜去關於頁時字往上飛走（我們在往下掉）
 */
const FLY_THROUGH = {
  keyframes: [
    { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
    { transform: 'scale(1.18)', opacity: 0, filter: 'blur(6px)' },
  ],
  options: { duration: 750, easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)' },
};
const FALL_AWAY = {
  keyframes: [
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(-45vh)', opacity: 0 },
  ],
  options: { duration: 900, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' },
};
/** 去碎念：背景碎成大方塊的那半秒裡，字很快退遠、消失 */
const PULL_BACK = {
  keyframes: [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(0.94)', opacity: 0 },
  ],
  options: { duration: 420, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
};
const LEAVE = (to: string) => (to === 'about' ? FALL_AWAY : to === 'thinking' ? PULL_BACK : FLY_THROUGH);
const stillHome = () => stripLocalePrefix(window.location.pathname) === '';

function Window({
  to,
  className,
  sky,
  label,
  en,
  children,
}: {
  to?: string;
  className: string;
  sky: WindowSky;
  label: string;
  en: string;
  children: ReactNode;
}) {
  const head = (
    <div className="hw-head">
      <span className="hw-label">{label}</span>
      <span className="hw-en">{en}</span>
    </div>
  );
  const body = (
    <>
      <SkyCanvas sky={sky} />
      <div className="hw-shade" aria-hidden="true" />
      <div className="hw-content">
        {head}
        {children}
      </div>
    </>
  );
  return to ? (
    <LocaleLink to={to} className={`hw ${className}`} data-reveal>
      {body}
    </LocaleLink>
  ) : (
    <div className={`hw ${className}`} data-reveal>
      {body}
    </div>
  );
}

const COLLECTION_LABELS: Record<(typeof COLLECTION_STARS)[number]['key'], [string, string]> = {
  music: ['在聽', '/music'],
  watch: ['在看', '/watch'],
  bookshelf: ['書櫃', '/bookshelf'],
};

export default function HomeSky() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { data: digest } = useQuery(homeDigestQueryOptions(locale));
  const { data: quote } = useQuery(dailyQuoteQueryOptions(locale));
  const timeAgo = useTimeAgo();
  const pageRef = useRef<HTMLDivElement | null>(null);

  // 從別的頁面飛回來：土星大約在第 1.3 秒回到畫面上，字跟著出現
  useSkyPage(pageRef, { sky: 'home', ready: true, arriveAt: 1300, leave: LEAVE, stillHere: stillHome });
  useReveal(pageRef);

  const posts = digest?.posts ?? [];
  const thought = digest?.thoughts.at(0);
  const latest = posts.at(0);

  return (
    <div className="home-page" ref={pageRef}>
      <section className="home-hero" id="home">
        <div className="home-intro">
          <p className="home-kicker">
            <span>宙と木</span>
            <span className="home-kicker-dot" aria-hidden="true" />
            <span>sora to ki</span>
          </p>
          <h1 className="home-name">Koimsurai</h1>
          <p className="home-line">
            I shape <em>ideas</em> into products that feel right.
          </p>
          <p className="home-sub">A full-stack engineer building interfaces, systems, and a tiny universe.</p>
          <nav className="home-links" aria-label="社群連結">
            <a href="https://github.com/timo9378" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <FaGithub />
            </a>
            <a
              href="https://www.instagram.com/koimsurai.23/?hl=zh-tw"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <FaInstagram />
            </a>
            <a href="mailto:timo9378@gmail.com" aria-label="Email">
              <FaEnvelope />
            </a>
            <a href="/api/rss" target="_blank" rel="noopener noreferrer" aria-label="RSS">
              <FaRss />
            </a>
          </nav>
        </div>

        {/* 此刻：像儀表上的讀數，一行一個訊號 */}
        <div className="home-now">
          {latest && (
            <LocaleLink to={postPath(latest)} className="home-now-row">
              <span className="home-now-key">新寫下的</span>
              <span className="home-now-val">{latest.title}</span>
              <time className="home-now-time" dateTime={latest.created_at} suppressHydrationWarning>
                {timeAgo(latest.created_at)}
              </time>
            </LocaleLink>
          )}
          {thought && (
            <LocaleLink to="/thinking" className="home-now-row">
              <span className="home-now-key">剛閃過的</span>
              <span className="home-now-val">{plain(thought.content)}</span>
              <time className="home-now-time" dateTime={thought.created_at} suppressHydrationWarning>
                {timeAgo(thought.created_at)}
              </time>
            </LocaleLink>
          )}
        </div>

        <p className="home-hint" aria-hidden="true">
          往下，是別處的夜空
        </p>
      </section>

      <section className="home-windows" id="lately" aria-label="各處的天空">
        <Window to="/blog" className="hw-notes" sky={notesSky} label="手記" en="Notes">
          <ul className="hw-list">
            {posts.slice(0, 3).map((p) => (
              <li key={p.id}>
                <span className="hw-list-title">{p.title}</span>
                <time dateTime={p.created_at} suppressHydrationWarning>
                  {timeAgo(p.created_at)}
                </time>
              </li>
            ))}
          </ul>
        </Window>

        <Window to="/thinking" className="hw-moments" sky={momentsSky} label="碎念" en="Moments">
          <MomentFlash thoughts={digest?.thoughts.slice(0, 4) ?? []} />
        </Window>

        <Window className="hw-collection" sky={collectionSky} label="收藏" en="Collection">
          <p className="hw-quote hw-quote--small hw-collection-line">聽過的、看過的、讀過的，後來都連成了星座。</p>
          {COLLECTION_STARS.map((s) => {
            const [name, to] = COLLECTION_LABELS[s.key];
            return (
              <LocaleLink
                key={s.key}
                to={to}
                className="hw-star"
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
              >
                {name}
              </LocaleLink>
            );
          })}
        </Window>

        <Window to="/about" className="hw-about" sky={aboutSky} label="關於" en="About">
          <p className="hw-quote hw-quote--small">掠過無數個稚嫩與迷惘的昨日，就此落下。</p>
        </Window>

        <nav className="home-more" data-reveal aria-label="其他地方">
          <LocaleLink to="/photos">照片</LocaleLink>
          <LocaleLink to="/setup">設備</LocaleLink>
          <LocaleLink to="/activity">足跡</LocaleLink>
          <LocaleLink to="/friends">朋友</LocaleLink>
          <LocaleLink to="/messages">留言</LocaleLink>
        </nav>
      </section>

      <footer className="home-signoff" data-reveal>
        {quote && (
          <blockquote>
            <p>{quote.text}</p>
            {quote.from && <cite>{quote.from}</cite>}
          </blockquote>
        )}
        <p className="home-copy">© Koimsurai · 宙と木</p>
      </footer>
    </div>
  );
}
