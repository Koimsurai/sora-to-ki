import type { ReactNode } from 'react';

import { localeCoverage, type LocalePost } from './adminFormat';
import './AdminPage.css';

// 後台各頁共用的小零件（2026-10 後台提案）：頁首、分段標題、語系點。
// 版面的外框在 AdminLayout，這裡只管「一頁裡面」反覆出現的東西，讓每一頁長得一樣。
// 純函式（日期、狀態名、語系判斷）在 adminFormat.ts。

/** 頁首：一行等寬小字、頁名（宋體）旁邊一個英文名（Instrument Serif），右邊放這頁的動作 */
export function PageHead({
  title,
  latin,
  meta,
  actions,
}: {
  title: string;
  latin: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="adm-head">
      <div className="adm-head-text">
        {meta && <span className="adm-caps">{meta}</span>}
        <h1 className="adm-h1">
          {title}
          {/* 英文名只是裝飾（同一個名字的另一種寫法），報讀器念頁名就好 */}
          <span className="adm-latin" aria-hidden="true">
            {latin}
          </span>
        </h1>
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </header>
  );
}

/** 分段標題：等寬小字，後面一條點線拉到底，最右邊可以放一個「全部 →」 */
export function SectionHead({ id, children, action }: { id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <h2 id={id} className="adm-section-head">
      <span>{children}</span>
      <span className="adm-rule" aria-hidden="true" />
      {action}
    </h2>
  );
}

/** 五顆小點：有那個語系的是實心，缺的是空心。報讀器念的是「語系：繁、EN」這種一句話 */
export function LocaleDots({ post }: { post: LocalePost }) {
  const coverage = localeCoverage(post);
  const has = coverage.filter((l) => l.has).map((l) => l.label);
  return (
    <span className="adm-locs">
      <span className="sr-only">語系：{has.length ? has.join('、') : '還沒有任何語系'}</span>
      {coverage.map((l) => (
        <span key={l.code} className="adm-loc" data-has={l.has || undefined} aria-hidden="true">
          <span className="adm-loc-dot" />
          {l.label}
        </span>
      ))}
    </span>
  );
}
