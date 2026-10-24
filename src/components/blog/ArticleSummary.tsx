// 文章開頭的摘要：編號 00、四個角框起來、字小一號，上面一行等寬小字——它是附件，不是內文。
//
// 捲進畫面時四個角先畫出來，字再一個一個浮現（剛浮出來時亮一點、再退回摘要的顏色），
// 寫完才標上「AI 生成」、關鍵句底下才畫出底線。關鍵句連到它所在的章節（excerpt_links）：
// 滑過時右邊目錄那一章亮起來，點了跳過去。
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExcerptLink } from '@koimsurai/api-types';
import { chapterIds } from '@/lib/mdx/blogContent';
import type { TocHeading } from './OrbitToc';

/** 每個字之間隔多久浮出來 */
const CHAR_MS = 2.6;
/** 四個角畫出來之後多久開始出字 */
const TEXT_DELAY_MS = 350;

interface Piece {
  /** 在摘要裡從第幾個字開始（也拿來當 key） */
  at: number;
  text: string;
  /** 連到的標題 id */
  to?: string;
}

/** 摘要切成一段一段：關鍵句（找得到章節的）單獨一段，重疊的只留先出現的 */
function piecesOf(excerpt: string, links: readonly ExcerptLink[], ids: Map<string, string>): Piece[] {
  const spans = links
    .map((l) => ({ at: excerpt.indexOf(l.text), len: l.text.length, to: ids.get(l.to) }))
    .filter((s): s is { at: number; len: number; to: string } => s.at >= 0 && s.to !== undefined)
    .sort((a, b) => a.at - b.at);
  const out: Piece[] = [];
  let i = 0;
  for (const s of spans) {
    if (s.at < i) continue;
    if (s.at > i) out.push({ at: i, text: excerpt.slice(i, s.at) });
    out.push({ at: s.at, text: excerpt.slice(s.at, s.at + s.len), to: s.to });
    i = s.at + s.len;
  }
  if (i < excerpt.length) out.push({ at: i, text: excerpt.slice(i) });
  return out;
}

const chars = (text: string) =>
  Array.from(text, (ch, i) => (
    <span key={i} className="c">
      {ch}
    </span>
  ));

export default function ArticleSummary({
  excerpt,
  links,
  headings,
  pingRef,
}: {
  excerpt: string;
  links: readonly ExcerptLink[];
  headings: readonly TocHeading[];
  pingRef: React.RefObject<((id: string | null) => void) | null>;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const pieces = useMemo(() => piecesOf(excerpt, links, chapterIds(headings)), [excerpt, links, headings]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-on', 'is-done', 'is-plain');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-plain', 'is-on', 'is-done');
      return;
    }
    const cs = [...el.querySelectorAll<HTMLElement>('.c')];
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        el.classList.add('is-on');
        const t0 = performance.now() + TEXT_DELAY_MS;
        let shown = 0;
        const step = (now: number) => {
          const k = Math.min(cs.length, Math.floor((now - t0) / CHAR_MS));
          for (; shown < k; shown++) cs[shown].classList.add('in');
          if (shown < cs.length) raf = requestAnimationFrame(step);
          else el.classList.add('is-done');
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [pieces]);

  const go = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - 96,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  return (
    <aside className="ar-sum" ref={ref}>
      <span className="ar-gut" aria-hidden="true">
        00
      </span>
      <div className="ar-sum-hd">
        <span>{t('blog.summary')}</span>
        <span className="ar-sum-ai">{t('blog.aiGen')}</span>
      </div>
      <p>
        {pieces.map((p) =>
          p.to ? (
            <a
              key={p.at}
              className="ar-link"
              href={`#${p.to}`}
              onMouseEnter={() => pingRef.current?.(p.to ?? null)}
              onMouseLeave={() => pingRef.current?.(null)}
              onFocus={() => pingRef.current?.(p.to ?? null)}
              onBlur={() => pingRef.current?.(null)}
              onClick={(e) => {
                e.preventDefault();
                if (p.to) go(p.to);
              }}
            >
              {chars(p.text)}
            </a>
          ) : (
            <span key={p.at}>{chars(p.text)}</span>
          ),
        )}
      </p>
    </aside>
  );
}
