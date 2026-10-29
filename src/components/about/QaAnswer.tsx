import type { ReactNode } from 'react';

import { LinkCard } from '@/components/common/LinkCard';
import { LocaleLink } from '@/i18n/locale-link';

// 此站點問答的答案（站長在後台填的）：只認四件事，不是完整的 Markdown——
//   空一行是分段、`程式碼`、[文字](網址)、單獨一段的網址是文章卡（跟文章裡的寫法一樣）。
// 站內的路徑（/ 開頭）走語系連結，換頁有轉場；站外的開新分頁。

const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    const [, code, label, href] = m;
    // 沒對到的群組在執行期是 undefined（型別上看不出來）：先看是不是程式碼，不是就一定是連結
    if (code) out.push(<code key={at}>{code}</code>);
    else if (href.startsWith('/'))
      out.push(
        <LocaleLink key={at} to={href}>
          {label}
        </LocaleLink>,
      );
    else
      out.push(
        <a key={at} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function QaAnswer({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {paragraphs.map((p, i) =>
        /^https?:\/\/\S+$/.test(p) ? (
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <LinkCard key={i} href={p} />
        ) : (
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <p key={i}>{inline(p)}</p>
        ),
      )}
    </>
  );
}
