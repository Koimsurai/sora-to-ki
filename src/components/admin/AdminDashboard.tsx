import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AdminPostFull, MetricStat } from '@koimsurai/api-types';
import { useState, type ReactNode } from 'react';

import {
  adminBahamutStatusQueryOptions,
  adminCommentsQueryOptions,
  adminPostsQueryOptions,
  adminStatsQueryOptions,
  vitalsStatsQueryOptions,
} from '@/data/adminData';
import AdminLoading from './AdminLoading';
import { LocaleDots, PageHead, SectionHead } from './AdminPage';
import { STATUS_LABEL, formatWhen, missingTranslations } from './adminFormat';

// 總覽「此刻」（2026-10 後台提案）：最上面是「等你處理」——要你動手的事一件一行；
// 再來是四個數字、最近動過的手記、前台的 Web Vitals。
//
// 數字只放後端真的算得出來的。舊的儀表板在沒有資料時會補上寫死的值（瀏覽 1665、留言 56、
// 「+12%」「成長率 +23%」），那些全是編出來的，這裡一個都不留：拿不到就顯示「—」。

/** 跟手記列表同一個查詢鍵：兩頁共用快取，從總覽點進列表不用再抓一次 */
const ALL_POSTS = 'limit=500';
const VITALS_DAYS = 28;

const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Web Vitals 的門檻（web.dev 的定義）：≤ good 是好、≤ poor 是待改善、再上去是差 */
const VITALS = [
  { metric: 'LCP', good: 2500, poor: 4000, limit: '好 ≤ 2.5 s', show: (v: number) => `${(v / 1000).toFixed(2)} s` },
  { metric: 'INP', good: 200, poor: 500, limit: '好 ≤ 200 ms', show: (v: number) => `${Math.round(v)} ms` },
  { metric: 'CLS', good: 0.1, poor: 0.25, limit: '好 ≤ 0.1', show: (v: number) => v.toFixed(3) },
] as const;

const num = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('zh-TW'));
const touched = (p: AdminPostFull) => p.updated_at ?? p.created_at;

export default function AdminDashboard() {
  // 頁首的日期：打開這頁的那一刻（render 裡直接 new Date() 不是純函式）
  const [now] = useState(() => new Date());
  const posts = useQuery(adminPostsQueryOptions(ALL_POSTS));
  const stats = useQuery(adminStatsQueryOptions);
  const pending = useQuery(adminCommentsQueryOptions('status=pending&limit=1'));
  // 巴哈沒設定時這支照樣回 200（ok: false），所以不用 retry；真的失敗就不顯示那一行
  const bahamut = useQuery({ ...adminBahamutStatusQueryOptions, retry: false });
  const vitals = useQuery(vitalsStatsQueryOptions(VITALS_DAYS));

  const all = posts.data?.posts ?? [];
  const drafts = all.filter((p) => p.status === 'draft');
  const stalestDraft = drafts.reduce<AdminPostFull | null>(
    (old, p) => (!old || touched(p) < touched(old) ? p : old),
    null,
  );
  const published = all.filter((p) => p.status === 'published');
  const gaps = published.map((p) => missingTranslations(p)).filter((m) => m.length > 0);
  const gapCount = (code: string) => gaps.filter((m) => m.some((l) => l.code === code)).length;
  const recent = [...all].sort((a, b) => touched(b).localeCompare(touched(a))).slice(0, 5);

  const pendingCount = pending.data?.counts.pending ?? 0;
  const newestPending = pending.data?.comments[0];
  const s = stats.data;

  // ── 等你處理：一件一行，沒事就說沒事 ──
  const todos: ReactNode[] = [];
  if (pendingCount > 0) {
    todos.push(
      <li key="comments" className="adm-row">
        <span className="adm-mark" aria-hidden="true">
          ○
        </span>
        <span className="adm-row-main">
          <span className="adm-row-title">{pendingCount} 則留言等你審</span>
          {newestPending && (
            <span className="adm-row-sub">
              最新一則是 {newestPending.author}，留在
              {newestPending.post_title ? `〈${newestPending.post_title}〉` : '碎念或留言板'}
            </span>
          )}
        </span>
        <Link to="/admin/comments" className="adm-row-action">
          去審 →
        </Link>
      </li>,
    );
  }
  if (drafts.length > 0) {
    todos.push(
      <li key="drafts" className="adm-row">
        <span className="adm-mark" aria-hidden="true">
          ○
        </span>
        <span className="adm-row-main">
          <span className="adm-row-title">{drafts.length} 篇草稿</span>
          {stalestDraft && (
            <span className="adm-row-sub">
              最久沒動的是〈{stalestDraft.title}〉，停在 {formatWhen(touched(stalestDraft), 'yyyy.MM.dd')}
            </span>
          )}
        </span>
        <Link to="/admin/posts" search={{ status: 'draft' }} className="adm-row-action">
          繼續寫 →
        </Link>
      </li>,
    );
  }
  if (gaps.length > 0) {
    todos.push(
      <li key="gaps" className="adm-row">
        <span className="adm-mark" aria-hidden="true">
          ○
        </span>
        <span className="adm-row-main">
          <span className="adm-row-title">{gaps.length} 篇已發佈的手記少了譯文</span>
          <span className="adm-row-sub">
            缺 EN {gapCount('en')} · 日 {gapCount('ja')} · 韓 {gapCount('ko')}（简中由繁中轉換，不算在內）
          </span>
        </span>
        <Link to="/admin/posts" search={{ missing: true }} className="adm-row-action">
          看清單 →
        </Link>
      </li>,
    );
  }
  const b = bahamut.data;
  if (b && (!b.ok || (b.daysLeft !== null && b.daysLeft <= 3))) {
    todos.push(
      <li key="bahamut" className="adm-row">
        <span className="adm-mark" data-tone="flare" aria-hidden="true">
          ×
        </span>
        <span className="adm-row-main">
          <span className="adm-row-title">
            {b.ok ? `巴哈姆特的登入再 ${b.daysLeft} 天就過期` : '巴哈姆特的 cookie 失效了'}
          </span>
          <span className="adm-row-sub">
            {b.ok ? '過期之後收藏頁的「在看」就不會再更新' : '收藏頁的「在看」停在上一次同步，要重新登入一次'}
          </span>
        </span>
      </li>,
    );
  }

  const loadingTodos = posts.isPending || pending.isPending;

  return (
    <div className="adm-page">
      <PageHead
        title="此刻"
        latin="Now"
        meta={`${formatWhen(now, 'yyyy.MM.dd')} · ${DAY[now.getDay()]} · ${formatWhen(now, 'HH:mm')}`}
        actions={
          <>
            <Link to="/thinking" className="adm-btn">
              寫一則碎念
            </Link>
            <Link to="/admin/posts/create" className="adm-btn adm-btn-primary">
              新寫一篇手記
            </Link>
          </>
        }
      />

      <section aria-labelledby="todo-h">
        <SectionHead id="todo-h">等你處理{loadingTodos ? '' : ` · ${todos.length} 件`}</SectionHead>
        {loadingTodos ? (
          <AdminLoading label="看看有什麼事" />
        ) : todos.length > 0 ? (
          <ul className="adm-list">{todos}</ul>
        ) : (
          <p className="adm-empty">沒有要處理的事。</p>
        )}
      </section>

      <section aria-label="站上的數字" className="adm-tiles">
        <div className="adm-tile">
          <span className="adm-caps">手記</span>
          <span className="adm-tile-num">{num(s?.publishedPosts)}</span>
          <span className="adm-tile-sub">已發佈 · 草稿 {num(s?.draftPosts)}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">近 30 天</span>
          <span className="adm-tile-num">{num(s?.postsThisMonth)}</span>
          <span className="adm-tile-sub">篇新寫的</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">留言</span>
          <span className="adm-tile-num">{num(s?.commentsThisWeek)}</span>
          <span className="adm-tile-sub">近 7 天 · 待審 {pending.isPending ? '—' : pendingCount}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">瀏覽</span>
          <span className="adm-tile-num">{num(s?.visitors)}</span>
          <span className="adm-tile-sub">所有手記加起來</span>
        </div>
      </section>

      <div className="adm-split">
        <section aria-labelledby="recent-h" className="adm-split-main">
          <SectionHead
            id="recent-h"
            action={
              <Link to="/admin/posts" aria-label="全部手記">
                全部 →
              </Link>
            }
          >
            最近動過
          </SectionHead>
          {posts.isPending ? (
            <AdminLoading />
          ) : recent.length === 0 ? (
            <p className="adm-empty">還沒有手記。</p>
          ) : (
            <ul className="adm-list">
              {recent.map((post) => (
                <li key={post.id}>
                  <Link to="/admin/posts/edit/$id" params={{ id: String(post.id) }} className="adm-row">
                    <span className="adm-row-main">
                      <span className="adm-row-title">{post.title}</span>
                      <span className="adm-meta">
                        手記 · {post.category ?? '未分類'} · {formatWhen(touched(post))}
                      </span>
                    </span>
                    <LocaleDots post={post} />
                    <span className="adm-status" data-status={post.status}>
                      {STATUS_LABEL[post.status] ?? post.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="vitals-h" className="adm-split-side">
          <SectionHead id="vitals-h">訊號 · 近 {VITALS_DAYS} 天</SectionHead>
          <ul className="adm-list">
            {VITALS.map((v) => (
              <VitalRow key={v.metric} spec={v} stat={vitals.data?.metrics.find((m) => m.metric === v.metric)} />
            ))}
          </ul>
          <p className="adm-meta adm-footnote">p75 · 不含 /admin · 來源 web_vitals</p>
        </section>
      </div>
    </div>
  );
}

function VitalRow({ spec, stat }: { spec: (typeof VITALS)[number]; stat: MetricStat | undefined }) {
  const p75 = stat?.p75 ?? null;
  const rating = p75 === null ? null : p75 <= spec.good ? '好' : p75 <= spec.poor ? '待改善' : '差';
  return (
    <li className="adm-row adm-vital">
      <span className="adm-vital-name">{spec.metric}</span>
      <span className="adm-vital-value">{p75 === null ? '—' : spec.show(p75)}</span>
      <span className="adm-meta" data-tone={rating === '差' ? 'flare' : undefined}>
        {rating ? `${rating} · ${stat?.count ?? 0} 筆` : '沒有樣本'}
      </span>
    </li>
  );
}
