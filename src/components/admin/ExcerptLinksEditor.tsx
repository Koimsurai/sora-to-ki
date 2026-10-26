// 摘要裡「哪幾句連到哪一章」（excerpt_links）：側欄的摘要底下，把摘要切成一句一句，每句選一章或不連。
// 前台的文章頁上，連過的句子畫底線，滑過時目錄那一章亮起來、點了跳過去。
// 跟著上面的語系分頁：各語系的句子不同，章節編號相同（各語系的章節結構一樣）。
import { useMemo } from 'react';
import type { ExcerptLink } from '@koimsurai/api-types';
import {
  MAX_LINK_CHARS,
  MAX_LINKS_PER_LOCALE,
  chapterOptions,
  excerptSegments,
  orphanLinks,
  setLink,
} from '@/lib/excerptLinks';

export default function ExcerptLinksEditor({
  excerpt = '',
  content = '',
  links = [],
  onChange,
}: {
  excerpt?: string;
  content?: string;
  links?: readonly ExcerptLink[];
  onChange: (links: ExcerptLink[]) => void;
}) {
  const chapters = useMemo(() => chapterOptions(content), [content]);
  const segments = useMemo(() => excerptSegments(excerpt, links), [excerpt, links]);
  const orphans = orphanLinks(excerpt, links);
  const known = new Set(chapters.map((c) => c.num));
  const linked = segments.filter((s) => s.to).length;
  const full = links.length >= MAX_LINKS_PER_LOCALE;

  if (!excerpt.trim()) return <p className="pe-side-hint">先寫摘要，才能把句子連到章節。</p>;
  if (!chapters.length) return <p className="pe-side-hint">內文還沒有 ## 章節，摘要沒有地方可以連。</p>;

  return (
    <div className="pe-links">
      <p className="adm-meta">
        摘要對應 · 已連 {linked} 句（上限 {MAX_LINKS_PER_LOCALE}）
      </p>
      <ol className="pe-links-list">
        {segments.map((seg) => {
          const tooLong = seg.text.length > MAX_LINK_CHARS;
          return (
            <li key={seg.at} className="pe-link" data-on={seg.to ? true : undefined}>
              <span className="pe-link-text">{seg.text}</span>
              <select
                value={seg.to ?? ''}
                aria-label={`「${seg.text}」連到哪一章`}
                title={tooLong ? `一句最多 ${MAX_LINK_CHARS} 字` : undefined}
                disabled={!seg.to && (full || tooLong)}
                onChange={(e) => onChange(setLink(links, seg.text, e.target.value || null))}
              >
                <option value="">不連</option>
                {chapters.map((c) => (
                  <option key={c.num} value={c.num}>
                    {c.level === 3 ? '　' : ''}
                    {c.num} {c.text}
                  </option>
                ))}
                {seg.to && !known.has(seg.to) && <option value={seg.to}>{seg.to}（內文裡沒有這一章）</option>}
              </select>
            </li>
          );
        })}
      </ol>
      {orphans.length > 0 && (
        <div className="pe-links-orphans">
          <p className="adm-meta">摘要改過，這幾句已經找不到（存檔時後端也會忽略它們）：</p>
          <ul>
            {orphans.map((l) => (
              <li key={l.text}>
                <span>
                  {l.to} · {l.text}
                </span>
                <button
                  type="button"
                  className="adm-btn adm-btn-small"
                  onClick={() => onChange(setLink(links, l.text, null))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
