// 首頁（新版 demo）。
// 第一屏只有三樣東西：左邊的名字與一句話、右邊的 3D 土星（鏡頭把它往右讓開，見 starfieldGpu 的 placeCamera）、
// 左下角兩行「此刻」。往下捲，土星升上天空、變遠，底下一扇一扇浮現「天空之窗」：
// 每一扇是那一區真正的天空縮影（手記的星軌與樹、碎念的像素、收藏的星座、關於的小星球），
// 點進去就飛到那一片天空。沒有 footer，最後一行是今天的一句話。
import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaRss, FaEnvelope, FaInstagram } from 'react-icons/fa';
import { LocaleLink } from '@/i18n/locale-link';
import { homeDigestQueryOptions, dailyQuoteQueryOptions } from '@/data/homeData';
import { postPath } from '@/lib/postPath';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import { COLLECTION_STARS, drawAboutSky, drawCollectionSky, drawMomentsSky, drawNotesSky } from '@/lib/windowSkies';
import './HomeSky.css';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** 一扇窗的天空：跟著窗的大小重畫（畫一次就停，不跑動畫迴圈） */
function SkyCanvas({ draw }: { draw: Draw }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h);
    };
    const ro = new ResizeObserver(paint);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [draw]);
  return <canvas ref={ref} className="hw-sky" aria-hidden="true" />;
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

/** 離開首頁：鏡頭往前飛穿過土星，畫面上的字跟著往鏡頭衝過來、散掉 */
const LEAVE = {
  keyframes: [
    { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
    { transform: 'scale(1.18)', opacity: 0, filter: 'blur(6px)' },
  ],
  options: { duration: 750, easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)' },
};
const stillHome = () => stripLocalePrefix(window.location.pathname) === '';

function Window({
  to,
  className,
  draw,
  label,
  en,
  children,
}: {
  to?: string;
  className: string;
  draw: Draw;
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
      <SkyCanvas draw={draw} />
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
              <span className="home-now-key">最新手記</span>
              <span className="home-now-val">{latest.title}</span>
              <time className="home-now-time" dateTime={latest.created_at} suppressHydrationWarning>
                {timeAgo(latest.created_at)}
              </time>
            </LocaleLink>
          )}
          {thought && (
            <LocaleLink to="/thinking" className="home-now-row">
              <span className="home-now-key">剛剛閃過</span>
              <span className="home-now-val">{plain(thought.content)}</span>
              <time className="home-now-time" dateTime={thought.created_at} suppressHydrationWarning>
                {timeAgo(thought.created_at)}
              </time>
            </LocaleLink>
          )}
        </div>

        <p className="home-hint" aria-hidden="true">
          往下，看看各處的天空
        </p>
      </section>

      <section className="home-windows" id="lately" aria-label="各處的天空">
        <Window to="/blog" className="hw-notes" draw={drawNotesSky} label="手記" en="Notes">
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

        <Window to="/thinking" className="hw-moments" draw={drawMomentsSky} label="碎念" en="Moments">
          {thought && (
            <>
              <p className="hw-quote">{plain(thought.content)}</p>
              <time className="hw-meta" dateTime={thought.created_at} suppressHydrationWarning>
                {timeAgo(thought.created_at)}
              </time>
            </>
          )}
        </Window>

        <Window className="hw-collection" draw={drawCollectionSky} label="收藏" en="Collection">
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

        <Window to="/about" className="hw-about" draw={drawAboutSky} label="關於" en="About">
          <p className="hw-quote hw-quote--small">從這裡往下掉，落在一顆只有一棵樹的星球上。</p>
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
