import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AdminPostFull, MetricStat } from '@koimsurai/api-types';
import { useState, type ReactNode } from 'react';

import {
  adminBahamutStatusQueryOptions,
  adminCommentsQueryOptions,
  adminFriendsQueryOptions,
  adminPostsQueryOptions,
  adminStatsQueryOptions,
  vitalsStatsQueryOptions,
} from '@/data/adminData';
import { adminLang, useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { LocaleDots, PageHead, SectionHead } from './AdminPage';
import { formatWhen, missingTranslations, statusLabel } from './adminFormat';

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
  { metric: 'LCP', good: 2500, poor: 4000, limit: '≤ 2.5 s', show: (v: number) => `${(v / 1000).toFixed(2)} s` },
  { metric: 'INP', good: 200, poor: 500, limit: '≤ 200 ms', show: (v: number) => `${Math.round(v)} ms` },
  { metric: 'CLS', good: 0.1, poor: 0.25, limit: '≤ 0.1', show: (v: number) => v.toFixed(3) },
] as const;

const num = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString(adminLang()));
const touched = (p: AdminPostFull) => p.updated_at ?? p.created_at;

export default function AdminDashboard() {
  const { t } = useAdminT();
  // 頁首的日期：打開這頁的那一刻（render 裡直接 new Date() 不是純函式）
  const [now] = useState(() => new Date());
  const posts = useQuery(adminPostsQueryOptions(ALL_POSTS));
  const stats = useQuery(adminStatsQueryOptions);
  const pending = useQuery(adminCommentsQueryOptions('status=pending&limit=1'));
  const friends = useQuery(adminFriendsQueryOptions);
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
          <span className="adm-row-title">{t('dashboard.todo.comments', { count: pendingCount })}</span>
          {newestPending && (
            <span className="adm-row-sub">
              {newestPending.post_title
                ? t('dashboard.todo.newestCommentOnPost', {
                    author: newestPending.author,
                    title: newestPending.post_title,
                  })
                : t('dashboard.todo.newestCommentElsewhere', { author: newestPending.author })}
            </span>
          )}
        </span>
        <Link to="/admin/comments" className="adm-row-action">
          {t('dashboard.go.review')}
        </Link>
      </li>,
    );
  }
  const friendCounts = friends.data?.counts;
  if (friendCounts && friendCounts.pending > 0) {
    const newest = friends.data?.friends.find((f) => f.status === 'pending');
    todos.push(
      <li key="friends" className="adm-row">
        <span className="adm-mark" aria-hidden="true">
          ○
        </span>
        <span className="adm-row-main">
          <span className="adm-row-title">{t('dashboard.todo.friends', { count: friendCounts.pending })}</span>
          {newest && (
            <span className="adm-row-sub">
              {t('dashboard.todo.newestFriend', { name: newest.name, date: formatWhen(newest.created_at, 'MM.dd') })}
            </span>
          )}
        </span>
        <Link to="/admin/friends" className="adm-row-action">
          {t('dashboard.go.look')}
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
          <span className="adm-row-title">{t('dashboard.todo.drafts', { count: drafts.length })}</span>
          {stalestDraft && (
            <span className="adm-row-sub">
              {t('dashboard.todo.stalestDraft', {
                title: stalestDraft.title,
                date: formatWhen(touched(stalestDraft), 'yyyy.MM.dd'),
              })}
            </span>
          )}
        </span>
        <Link to="/admin/posts" search={{ status: 'draft' }} className="adm-row-action">
          {t('dashboard.go.continue')}
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
          <span className="adm-row-title">{t('dashboard.todo.gaps', { count: gaps.length })}</span>
          <span className="adm-row-sub">
            {t('dashboard.todo.gapsDetail', { en: gapCount('en'), ja: gapCount('ja'), ko: gapCount('ko') })}
          </span>
        </span>
        <Link to="/admin/posts" search={{ missing: true }} className="adm-row-action">
          {t('dashboard.go.list')}
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
            {b.ok ? t('dashboard.todo.bahamutExpiring', { days: b.daysLeft }) : t('dashboard.todo.bahamutExpired')}
          </span>
          <span className="adm-row-sub">
            {b.ok ? t('dashboard.todo.bahamutExpiringDetail') : t('dashboard.todo.bahamutExpiredDetail')}
          </span>
        </span>
      </li>,
    );
  }

  const loadingTodos = posts.isPending || pending.isPending;

  return (
    <div className="adm-page">
      <PageHead
        title={t('dashboard.title')}
        latin="Now"
        meta={`${formatWhen(now, 'yyyy.MM.dd')} · ${DAY[now.getDay()]} · ${formatWhen(now, 'HH:mm')}`}
        actions={
          <>
            <Link to="/thinking" className="adm-btn">
              {t('dashboard.writeThought')}
            </Link>
            <Link to="/admin/posts/create" className="adm-btn adm-btn-primary">
              {t('dashboard.writePost')}
            </Link>
          </>
        }
      />

      <section aria-labelledby="todo-h">
        <SectionHead id="todo-h">
          {loadingTodos ? t('dashboard.todo.heading') : t('dashboard.todo.headingCount', { count: todos.length })}
        </SectionHead>
        {loadingTodos ? (
          <AdminLoading label={t('dashboard.todo.loading')} />
        ) : todos.length > 0 ? (
          <ul className="adm-list">{todos}</ul>
        ) : (
          <p className="adm-empty">{t('dashboard.todo.empty')}</p>
        )}
      </section>

      <section aria-label={t('dashboard.tiles.label')} className="adm-tiles">
        <div className="adm-tile">
          <span className="adm-caps">{t('dashboard.tiles.posts')}</span>
          <span className="adm-tile-num">{num(s?.publishedPosts)}</span>
          <span className="adm-tile-sub">
            {s?.nextScheduledAt
              ? t('dashboard.tiles.postsSubScheduled', {
                  drafts: num(s.draftPosts),
                  when: formatWhen(s.nextScheduledAt, 'MM.dd HH:mm'),
                })
              : t('dashboard.tiles.postsSub', { drafts: num(s?.draftPosts) })}
          </span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{t('dashboard.tiles.recent')}</span>
          <span className="adm-tile-num">{num(s?.postsThisMonth)}</span>
          <span className="adm-tile-sub">{t('dashboard.tiles.recentSub')}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{t('dashboard.tiles.comments')}</span>
          <span className="adm-tile-num">{num(s?.commentsThisWeek)}</span>
          <span className="adm-tile-sub">
            {t('dashboard.tiles.commentsSub', { pending: pending.isPending ? '—' : pendingCount })}
          </span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{t('dashboard.tiles.views')}</span>
          <span className="adm-tile-num">{num(s?.visitors)}</span>
          <span className="adm-tile-sub">{t('dashboard.tiles.viewsSub')}</span>
        </div>
      </section>

      <div className="adm-split">
        <section aria-labelledby="recent-h" className="adm-split-main">
          <SectionHead
            id="recent-h"
            action={
              <Link to="/admin/posts" aria-label={t('dashboard.recent.allLabel')}>
                {t('dashboard.recent.all')}
              </Link>
            }
          >
            {t('dashboard.recent.heading')}
          </SectionHead>
          {posts.isPending ? (
            <AdminLoading />
          ) : recent.length === 0 ? (
            <p className="adm-empty">{t('dashboard.recent.empty')}</p>
          ) : (
            <ul className="adm-list">
              {recent.map((post) => (
                <li key={post.id}>
                  <Link to="/admin/posts/edit/$id" params={{ id: String(post.id) }} className="adm-row">
                    <span className="adm-row-main">
                      <span className="adm-row-title">{post.title}</span>
                      <span className="adm-meta">
                        {t('dashboard.recent.meta', {
                          category: post.category ?? t('dashboard.recent.uncategorized'),
                          when: formatWhen(touched(post)),
                        })}
                      </span>
                    </span>
                    <LocaleDots post={post} />
                    <span className="adm-status" data-status={post.status}>
                      {statusLabel(post.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="vitals-h" className="adm-split-side">
          <SectionHead id="vitals-h">{t('dashboard.vitals.heading', { days: VITALS_DAYS })}</SectionHead>
          <ul className="adm-list">
            {VITALS.map((v) => (
              <VitalRow key={v.metric} spec={v} stat={vitals.data?.metrics.find((m) => m.metric === v.metric)} />
            ))}
          </ul>
          <p className="adm-meta adm-footnote">{t('dashboard.vitals.footnote')}</p>
        </section>
      </div>
    </div>
  );
}

function VitalRow({ spec, stat }: { spec: (typeof VITALS)[number]; stat: MetricStat | undefined }) {
  const { t } = useAdminT();
  const p75 = stat?.p75 ?? null;
  const rating = p75 === null ? null : p75 <= spec.good ? 'good' : p75 <= spec.poor ? 'needsWork' : 'poor';
  return (
    <li className="adm-row adm-vital">
      <span className="adm-vital-name">{spec.metric}</span>
      <span className="adm-vital-value">{p75 === null ? '—' : spec.show(p75)}</span>
      <span className="adm-meta" data-tone={rating === 'poor' ? 'flare' : undefined}>
        {rating
          ? t('dashboard.vitals.ratingCount', {
              rating: t(`dashboard.vitals.rating.${rating}`),
              count: stat?.count ?? 0,
            })
          : t('dashboard.vitals.noSamples')}
      </span>
    </li>
  );
}
