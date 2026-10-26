// 摘要裡「哪幾段連到哪一章」（excerpt_links）。文章頁上連過的那段畫底線，滑過時目錄那一章亮起來、點了跳過去。
//
// 側欄太窄，只放精簡的：已經連了哪幾段，跟一顆「編輯對應」。編輯在一個寬的視窗裡：
// 左邊是整段摘要（連過的畫底線、標上章節），右邊是內文的章節。反白左邊一段字、點右邊一章就連好；
// 點已經連的那段，可以點別章換過去或取消。
// 跟著上面的語系分頁：各語系的字不同，章節編號相同（各語系的章節結構一樣）。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExcerptLink } from '@koimsurai/api-types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  MAX_LINKS_PER_LOCALE,
  chapterOptions,
  checkSelection,
  excerptPieces,
  orphanLinks,
  setLink,
  type ChapterOption,
} from '@/lib/excerptLinks';

export default function ExcerptLinksEditor({
  excerpt = '',
  content = '',
  links = [],
  localeLabel = '',
  onChange,
}: {
  excerpt?: string;
  content?: string;
  links?: readonly ExcerptLink[];
  /** 視窗標題上寫的是哪個語系 */
  localeLabel?: string;
  onChange: (links: ExcerptLink[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chapters = useMemo(() => chapterOptions(content), [content]);
  const titleOf = useMemo(() => new Map(chapters.map((c) => [c.num, c.text])), [chapters]);
  const found = links.filter((l) => excerpt.includes(l.text));

  const blocked = !excerpt.trim()
    ? '先寫摘要，才能把摘要裡的字連到章節。'
    : !chapters.length
      ? '內文還沒有 ## 章節，摘要沒有地方可以連。'
      : null;

  return (
    <div className="pe-links">
      <div className="pe-links-bar">
        <span className="adm-meta">摘要對應 · 已連 {found.length} 段</span>
        <button type="button" className="adm-btn adm-btn-small" disabled={!!blocked} onClick={() => setOpen(true)}>
          編輯對應
        </button>
      </div>
      {blocked ? (
        <p className="pe-side-hint">{blocked}</p>
      ) : found.length ? (
        <ul className="pe-links-list">
          {found.map((l) => (
            <li key={l.text}>
              <span className="pe-links-to">{l.to}</span>
              <span className="pe-links-text">{l.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pe-side-hint">讀者在文章頁點摘要裡連過的那段，會跳到它連的那一章。</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* shadcn 的 Dialog 預設最寬 512px，這裡要放兩欄 */}
        <DialogContent className="max-w-[min(960px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>摘要對應{localeLabel ? ` · ${localeLabel}` : ''}</DialogTitle>
            <DialogDescription>
              在左邊的摘要裡反白一段字，再點右邊的一章就連好；點已經連的那段，可以點別章換過去或取消。
            </DialogDescription>
          </DialogHeader>
          <LinkBoard excerpt={excerpt} links={links} chapters={chapters} titleOf={titleOf} onChange={onChange} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 視窗裡的兩欄：左邊摘要、右邊章節 */
function LinkBoard({
  excerpt,
  links,
  chapters,
  titleOf,
  onChange,
}: {
  excerpt: string;
  links: readonly ExcerptLink[];
  chapters: ChapterOption[];
  titleOf: Map<string, string>;
  onChange: (links: ExcerptLink[]) => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  /** 正在處理的那段：剛反白的、或點了已經連的那段 */
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pieces = excerptPieces(excerpt, links);
  const orphans = orphanLinks(excerpt, links);
  const pickedTo = picked ? links.find((l) => l.text === picked)?.to : undefined;
  const countOf = (num: string) => links.filter((l) => l.to === num && excerpt.includes(l.text)).length;

  // 反白（滑鼠放開、或用 Shift＋方向鍵選完）：只收摘要裡的字
  useEffect(() => {
    const box = textRef.current;
    if (!box) return;
    const take = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !box.contains(sel.anchorNode) || !box.contains(sel.focusNode)) return;
      const text = sel.toString().trim();
      const why = checkSelection(excerpt, links, text);
      setProblem(why);
      setPicked(why ? null : text);
    };
    box.addEventListener('mouseup', take);
    box.addEventListener('keyup', take);
    return () => {
      box.removeEventListener('mouseup', take);
      box.removeEventListener('keyup', take);
    };
  }, [excerpt, links]);

  /** 點已經連的那段：選起來（可以換章或取消），再點一次放開 */
  const toggle = (text: string) => {
    setProblem(null);
    setPicked(picked === text ? null : text);
  };

  const linkTo = (num: string) => {
    if (!picked) return;
    onChange(setLink(links, picked, num));
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  };

  const status =
    problem ??
    (picked
      ? pickedTo
        ? `「${picked}」連到 ${pickedTo}。點右邊別章換過去，或取消連結。`
        : `「${picked}」要連到哪一章？點右邊的一章。`
      : `已連 ${links.length} 段（一個語系最多 ${MAX_LINKS_PER_LOCALE} 段）。`);

  return (
    <div className="pe-board">
      <div className="pe-board-text" ref={textRef}>
        {pieces.map((p) =>
          p.to ? (
            <span
              key={p.at}
              // 不用 <button>：按鈕整塊不能跨行，長的一段會被擠到下一行、前一行留一截空白
              // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="button"
              tabIndex={0}
              className="pe-board-link"
              data-to={p.to}
              aria-pressed={picked === p.text}
              title={`${p.to} ${titleOf.get(p.to) ?? '（內文裡沒有這一章）'}`}
              onClick={() => toggle(p.text)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                toggle(p.text);
              }}
            >
              {p.text}
            </span>
          ) : (
            <span key={p.at}>{p.text}</span>
          ),
        )}
      </div>

      <div className="pe-board-side">
        <p className="pe-board-status" data-problem={problem ? true : undefined}>
          {status}
        </p>
        {picked && pickedTo && (
          <button
            type="button"
            className="adm-btn adm-btn-small"
            onClick={() => {
              onChange(setLink(links, picked, null));
              setPicked(null);
            }}
          >
            取消這段的連結
          </button>
        )}
        <ol className="pe-board-chapters">
          {chapters.map((c) => {
            const n = countOf(c.num);
            return (
              <li key={c.num} data-level={c.level}>
                <button
                  type="button"
                  disabled={!picked}
                  aria-current={pickedTo === c.num ? 'true' : undefined}
                  onClick={() => linkTo(c.num)}
                >
                  <span className="pe-board-num">{c.num}</span>
                  <span className="pe-board-title">{c.text}</span>
                  {n > 0 && <span className="pe-board-count">{n}</span>}
                </button>
              </li>
            );
          })}
        </ol>
        {orphans.length > 0 && (
          <div className="pe-links-orphans">
            <p className="adm-meta">摘要改過，這幾段已經找不到（存檔時後端也會忽略它們）：</p>
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
    </div>
  );
}
