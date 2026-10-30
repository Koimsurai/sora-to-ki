import { useQuery } from '@tanstack/react-query';
import type { AnalyticsPoint, AnalyticsResponse, AnalyticsRow, PostPerf, ReactionLogEvent } from '@koimsurai/api-types';
import { useState, type CSSProperties } from 'react';
import { Trans } from 'react-i18next';

import { adminAnalyticsQueryOptions, adminReactionsQueryOptions, type AnalyticsPeriod } from '@/data/adminData';
import { adminLang, at, useAdminT } from '@/i18n/admin-i18n';
import { isLocale } from '@/lib/locales';
import AdminLoading from './AdminLoading';
import { PageHead, SectionHead, TabPanel } from './AdminPage';
import './AdminAnalytics.css';

// 流量：自架 Plausible 的數字，畫成後台自己的樣子（後端代理 Stats API，見 handlers/analytics.rs）。
// 不直接攤統計術語，而是回答幾個問題：來了多少人、比上一段多還少；每篇文章有沒有人讀完；
// 從哪裡來、先看了什麼；在 Google 搜了什麼（Search Console）；收到哪些愛心與反應（reaction_log）。
// 每個數字旁邊一句白話說明。國家、裝置、熱門頁面收在最後。
// 站長自己的瀏覽不會進來：後台開過的瀏覽器會設 plausible_ignore（AdminLayout），
// 以前留下的後台瀏覽在熱門頁面裡也濾掉了。

const PERIODS: AnalyticsPeriod[] = ['today', '3d', '7d', '30d', '6mo'];

const num = (n: number) => n.toLocaleString(adminLang());

/**
 * 秒 → 「2分05秒」。數字是等寬大字，單位縮成小字——
 * 中文單位放進等寬字裡會被撐成跟數字一樣寬，「2 分 28 秒」讀起來像四個數字
 */
function Duration({ sec }: { sec: number }) {
  const { t } = useAdminT();
  const s = Math.round(sec);
  const unit = (u: string) => <span className="adm-an-unit">{u}</span>;
  if (s < 60)
    return (
      <>
        {s}
        {unit(t('analytics.unit.sec'))}
      </>
    );
  return (
    <>
      {Math.floor(s / 60)}
      {unit(t('analytics.unit.min'))}
      {String(s % 60).padStart(2, '0')}
      {unit(t('analytics.unit.sec'))}
    </>
  );
}

/** `2026-10-26` → `10.26`、`2026-10-26 14:00` → `14:00`（不經過 Date：字串本來就是站台時區的時間） */
const shortDate = (d: string) => (d.length > 10 ? d.slice(11, 16) : `${d.slice(5, 7)}.${d.slice(8, 10)}`);

/** 國名跟著後台語言：每個語言建一次就留著 */
const regionNamesByLang = new Map<string, Intl.DisplayNames | null>();
function regionNames(): Intl.DisplayNames | null {
  const lang = adminLang();
  if (!regionNamesByLang.has(lang)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
      names = null;
    }
    regionNamesByLang.set(lang, names);
  }
  return regionNamesByLang.get(lang) ?? null;
}

/** Plausible 回的裝置名稱（有翻譯的那幾個） */
const DEVICES = new Set(['Desktop', 'Laptop', 'Mobile', 'Tablet']);

/**
 * 兩碼的地區代碼 → 中文國名。`Intl.DisplayNames` 拿到不合格的代碼會丟 RangeError（不是回 undefined），
 * 一個怪值就讓整頁掛掉：查不到國家的訪客 Plausible 回的是兩個 NUL（後端已經濾掉，這裡再擋一次）
 */
function countryName(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return at('analytics.unknownCountry');
  try {
    return regionNames()?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const label = {
  page: (n: string) => n,
  source: (n: string) => (n === 'Direct / None' ? at('analytics.direct') : n),
  country: countryName,
  device: (n: string) => (DEVICES.has(n) ? at(`analytics.device.${n}`) : n),
};

export default function AdminAnalytics() {
  const { t } = useAdminT();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const { data, isPending, error } = useQuery(adminAnalyticsQueryOptions(period));

  const live =
    data?.configured && data.realtime !== null ? t('analytics.live', { count: data.realtime }) : t('analytics.source');
  return (
    <div className="adm-page">
      <PageHead
        title={t('nav.analytics')}
        latin="Traffic"
        meta={isPending ? t('common.loading') : live}
        actions={
          data?.configured && (
            <a className="adm-btn" href={data.dashboard_url} target="_blank" rel="noreferrer">
              {t('analytics.openPlausible')}
            </a>
          )
        }
      />

      <section className="adm-stack" aria-label={t('nav.analytics')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                className="adm-tab"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(`analytics.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={period}>
          {isPending ? (
            <AdminLoading />
          ) : error ? (
            <p className="adm-empty">{t('analytics.loadFailed', { message: error.message })}</p>
          ) : !data.configured ? (
            <Setup />
          ) : (
            <Report data={data} period={period} />
          )}
        </TabPanel>
      </section>
    </div>
  );
}

/** 拿來比的那一段怎麼稱呼：「今天」比的是昨天午夜到同一個時刻（後端 today_ranges） */
const prevWord = (period: AnalyticsPeriod) => at(period === 'today' ? 'analytics.prev.today' : 'analytics.prev.other');

/** 這一段跟上一段比：倍數、百分比或差不多 */
function compare(now: number, prev: number, than: string): string {
  if (prev <= 0) return now > 0 ? at('analytics.compare.noPrev', { than }) : '';
  const r = now / prev;
  if (r >= 2) return at('analytics.compare.times', { than, n: Math.round(r) });
  if (r >= 1.05) return at('analytics.compare.more', { than, pct: Math.round((r - 1) * 100) });
  if (r <= 0.95) return at('analytics.compare.less', { than, pct: Math.round((1 - r) * 100) });
  return at('analytics.compare.same', { than });
}

/** 一句話：來了多少人、比上一段多還少、主要從哪來 */
function Summary({ data, period }: { data: AnalyticsResponse; period: AnalyticsPeriod }) {
  const { t, i18n } = useAdminT();
  const v = data.totals.visitors;
  const cmp = compare(v, data.previous.visitors, prevWord(period));
  const top = data.sources.at(0);
  const share = top && v > 0 ? top.visitors / v : 0;
  const how = top?.name === 'Direct / None' ? 'Direct' : 'Source';
  const tenths = Math.floor(share * 10);
  const from =
    top && share >= 0.4
      ? t(`analytics.from.${share >= 0.95 ? 'all' : 'part'}${how}`, {
          source: label.source(top.name),
          tenths,
          pct: tenths * 10,
          count: num(top.visitors),
        })
      : '';
  return (
    <p className="adm-an-summary">
      <Trans
        t={t}
        i18n={i18n}
        i18nKey={cmp ? 'analytics.summary.compared' : 'analytics.summary.plain'}
        values={{ period: t(`analytics.periodWord.${period}`), count: num(v), cmp }}
        components={{ b: <b /> }}
      />
      {from}
    </p>
  );
}

/** 跟上一段比的那一行：↑／↓ 與上一段的數字；看得出好壞的（跳出率越低越好）多一個「變好／變差」 */
function Delta({
  now,
  prev,
  fmt,
  than,
  lowerIsBetter,
}: {
  now: number;
  prev: number;
  fmt: (n: number) => string;
  than: string;
  lowerIsBetter?: boolean;
}) {
  const { t } = useAdminT();
  if (!prev) return <span className="adm-an-delta">{t('analytics.delta.noData', { than })}</span>;
  const same = Math.abs(now - prev) < 0.005 * Math.max(1, Math.abs(prev));
  const up = now > prev;
  const verdict = same || lowerIsBetter === undefined ? 'plain' : up === !lowerIsBetter ? 'better' : 'worse';
  return (
    <span className="adm-an-delta">
      {t(`analytics.delta.${verdict}`, { arrow: same ? '＝' : up ? '↑' : '↓', than, prev: fmt(prev) })}
    </span>
  );
}

const durationText = (sec: number) => {
  const s = Math.round(sec);
  return s < 60
    ? at('analytics.duration.sec', { s })
    : at('analytics.duration.minSec', { m: Math.floor(s / 60), s: s % 60 });
};

function Report({ data, period }: { data: AnalyticsResponse; period: AnalyticsPeriod }) {
  const { t: tr } = useAdminT();
  const t = data.totals;
  const p = data.previous;
  const unit = period === 'today' ? 'hour' : period === '6mo' ? 'week' : 'day';
  const than = prevWord(period);
  return (
    <div className="adm-an-report">
      <Summary data={data} period={period} />

      <div className="adm-tiles" aria-label={tr('analytics.tiles.label')}>
        <div className="adm-tile">
          <span className="adm-caps">{tr('analytics.tiles.visitors')}</span>
          <span className="adm-tile-num">{num(t.visitors)}</span>
          <Delta now={t.visitors} prev={p.visitors} than={than} fmt={num} />
          <span className="adm-tile-sub">{tr('analytics.tiles.visitorsSub')}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{tr('analytics.tiles.pages')}</span>
          <span className="adm-tile-num">{(t.views_per_visit ?? 0).toFixed(1)}</span>
          <Delta now={t.views_per_visit ?? 0} prev={p.views_per_visit ?? 0} than={than} fmt={(n) => n.toFixed(1)} />
          <span className="adm-tile-sub">{tr('analytics.tiles.pagesSub')}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{tr('analytics.tiles.bounce')}</span>
          {/* 浮點數的欄位在型別上可能是 null（NaN 序列化成 null），當 0 */}
          <span className="adm-tile-num">
            {Math.round(t.bounce_rate ?? 0)}
            <span className="adm-an-unit">%</span>
          </span>
          <Delta
            now={t.bounce_rate ?? 0}
            prev={p.bounce_rate ?? 0}
            than={than}
            fmt={(n) => `${Math.round(n)}%`}
            lowerIsBetter
          />
          <span className="adm-tile-sub">{tr('analytics.tiles.bounceSub')}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">{tr('analytics.tiles.duration')}</span>
          <span className="adm-tile-num">
            <Duration sec={t.visit_duration ?? 0} />
          </span>
          <Delta now={t.visit_duration ?? 0} prev={p.visit_duration ?? 0} than={than} fmt={durationText} />
          <span className="adm-tile-sub">{tr('analytics.tiles.durationSub')}</span>
        </div>
      </div>

      <section aria-labelledby="an-series-h">
        <SectionHead id="an-series-h">{tr(`analytics.series.heading.${unit}`)}</SectionHead>
        <Bars points={data.series} unit={unit} />
      </section>

      <Posts data={data} />
      <Sources data={data} />
      <Search data={data} />
      <Reactions />

      <details className="adm-an-more">
        <summary>{tr('analytics.more.summary')}</summary>
        <div className="adm-an-grid">
          <Rank id="an-pages" title={tr('analytics.more.pages')} rows={data.pages} name={label.page} mono />
          <Rank id="an-countries" title={tr('analytics.more.countries')} rows={data.countries} name={label.country} />
          <Rank id="an-devices" title={tr('analytics.more.devices')} rows={data.devices} name={label.device} />
        </div>
        <p className="adm-an-note">{tr('analytics.more.note')}</p>
      </details>
    </div>
  );
}

/** 網址開頭的語系段 → 語系代碼（繁中沒有前綴） */
const URL_LOCALE: Record<string, string> = { 'zh-cn': 'zh-CN', en: 'en', ja: 'ja', ko: 'ko' };

/** 進站頁的網址 → 讀得懂的名字：首頁、手記、文章標題，各語系標在後面 */
function pageName(path: string, posts: PostPerf[]): string {
  const segs = path.split(/[?#]/)[0].split('/').filter(Boolean);
  const loc = segs[0] && URL_LOCALE[segs[0]] ? (segs.shift() ?? '') : '';
  const suffix = loc ? at('analytics.pageName.suffix', { lang: at(`analytics.langName.${URL_LOCALE[loc]}`) }) : '';
  if (segs.length === 0) return at('analytics.pageName.home', { suffix });
  if (segs[0] === 'blog' && segs.length === 1) return at('analytics.pageName.blog', { suffix });
  if (segs[0] === 'blog') {
    const post = posts.find((p) => p.slug === segs[1] || String(p.id) === segs[1]);
    return post ? at('analytics.pageName.post', { title: post.title, suffix }) : path;
  }
  return path;
}

/** 每篇文章：看的人、捲到、停留、讀完要多久、愛心、留言 */
function Posts({ data }: { data: AnalyticsResponse }) {
  const { t } = useAdminT();
  return (
    <section aria-labelledby="an-posts-h" className="adm-stack">
      <SectionHead id="an-posts-h">{t('analytics.posts.heading')}</SectionHead>
      <p className="adm-an-note">{t('analytics.posts.note')}</p>
      {data.posts.length === 0 ? (
        <p className="adm-meta">{t('analytics.posts.empty')}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-an-posts">
            <thead>
              <tr>
                <th scope="col">{t('analytics.posts.col.post')}</th>
                <th scope="col">{t('analytics.posts.col.visitors')}</th>
                <th scope="col">{t('analytics.posts.col.scroll')}</th>
                <th scope="col">{t('analytics.posts.col.time')}</th>
                <th scope="col">{t('analytics.posts.col.read')}</th>
                <th scope="col">{t('analytics.posts.col.hearts')}</th>
                <th scope="col">{t('analytics.posts.col.comments')}</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer">
                      {p.title}
                    </a>
                  </th>
                  <td>{num(p.visitors)}</td>
                  <td>{p.scroll_depth == null ? '—' : `${Math.round(p.scroll_depth)}%`}</td>
                  <td>{p.time_on_page == null ? '—' : durationText(p.time_on_page)}</td>
                  <td>{t('analytics.posts.readMinutes', { n: p.read_minutes })}</td>
                  <td>{num(p.hearts)}</td>
                  <td>{num(p.comments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 從哪裡來、先看了什麼 */
function Sources({ data }: { data: AnalyticsResponse }) {
  const { t } = useAdminT();
  return (
    <section aria-labelledby="an-src-h" className="adm-stack">
      <SectionHead id="an-src-h">{t('analytics.sources.heading')}</SectionHead>
      <p className="adm-an-note">{t('analytics.sources.note')}</p>
      {data.entries.length === 0 ? (
        <p className="adm-meta">{t('analytics.noData')}</p>
      ) : (
        <div className="adm-an-sources">
          {data.entries.map((s) => (
            <div key={s.source} className="adm-an-src">
              <div className="adm-an-src-head">
                <span>{label.source(s.source)}</span>
                <span className="adm-an-count">{t('analytics.sources.people', { count: num(s.visitors) })}</span>
              </div>
              <ol className="adm-an-rank">
                {s.entries.map((e) => (
                  <li
                    key={e.name}
                    style={{ '--w': `${(e.visitors / Math.max(1, s.visitors)) * 100}%` } as CSSProperties}
                  >
                    <span className="adm-an-name" title={e.name}>
                      {pageName(e.name, data.posts)}
                    </span>
                    <span className="adm-an-count">{num(e.visitors)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Google 搜尋字詞（Search Console） */
function Search({ data }: { data: AnalyticsResponse }) {
  const { t, i18n } = useAdminT();
  const s = data.search;
  return (
    <section aria-labelledby="an-search-h" className="adm-stack">
      <SectionHead id="an-search-h">{t('analytics.search.heading')}</SectionHead>
      {!s.configured ? (
        <p className="adm-an-note">
          <Trans t={t} i18n={i18n} i18nKey="analytics.search.setup" components={{ code: <code /> }} />
        </p>
      ) : s.error ? (
        <p className="adm-empty">{t('analytics.search.error', { error: s.error })}</p>
      ) : (
        <>
          <p className="adm-an-note">{t('analytics.search.note')}</p>
          {s.queries.length === 0 ? (
            <p className="adm-meta">{t('analytics.search.empty')}</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table adm-an-posts">
                <thead>
                  <tr>
                    <th scope="col">{t('analytics.search.col.query')}</th>
                    <th scope="col">{t('analytics.search.col.clicks')}</th>
                    <th scope="col">{t('analytics.search.col.impressions')}</th>
                    <th scope="col">{t('analytics.search.col.ctr')}</th>
                    <th scope="col">{t('analytics.search.col.position')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.queries.map((q) => (
                    <tr key={q.query}>
                      <th scope="row">{q.query}</th>
                      <td>{num(q.clicks)}</td>
                      <td>{num(q.impressions)}</td>
                      <td>{`${((q.ctr ?? 0) * 100).toFixed(1)}%`}</td>
                      <td>{(q.position ?? 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** 紀錄裡的裝置（有翻譯的那幾個） */
const EVENT_DEVICES = new Set(['mobile', 'desktop']);

/** 後端存的是 UTC 的 `yyyy-MM-dd HH:mm:ss` → 台北時間 `10.28 21:14` */
function eventTime(utc: string): string {
  const d = new Date(`${utc.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return utc;
  const parts = new Intl.DateTimeFormat(adminLang(), {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 一筆紀錄 → 一句話：誰（不知道）在哪裡做了什麼 */
function eventText(e: ReactionLogEvent): string {
  const title = e.target_title ?? at('analytics.reactions.deleted');
  const undo = e.delta < 0;
  switch (e.kind) {
    case 'post':
      return at(undo ? 'analytics.reactions.postUndo' : 'analytics.reactions.post', { title, value: e.value });
    case 'site':
      return at('analytics.reactions.site');
    case 'comment':
      // 留言不只掛在文章底下：留言頁與碎念的留言沒有文章標題，不能當成「已刪除」
      if (e.comment_on === 'thought') return at('analytics.reactions.commentThought', { title });
      if (e.comment_on === 'messages') return at('analytics.reactions.commentMessages');
      if (e.comment_on === null) return at('analytics.reactions.commentDeleted');
      if (e.comment_on === 'post') return at('analytics.reactions.commentPost', { title });
      return at('analytics.reactions.commentOther', { on: e.comment_on });
    case 'thought': {
      const dislike = e.value === 'dislike';
      if (undo)
        return at(dislike ? 'analytics.reactions.thoughtUndislike' : 'analytics.reactions.thoughtUnlike', { title });
      return at(dislike ? 'analytics.reactions.thoughtDislike' : 'analytics.reactions.thoughtLike', { title });
    }
    default:
      return `${e.kind} ${e.value}`;
  }
}

/** 收到的愛心與反應：最近的在上面，最後一行是開始記錄之前的總數 */
function Reactions() {
  const { t } = useAdminT();
  const { data, isPending, error } = useQuery(adminReactionsQueryOptions);
  return (
    <section aria-labelledby="an-react-h" className="adm-stack">
      <SectionHead id="an-react-h">{t('analytics.reactions.heading')}</SectionHead>
      <p className="adm-an-note">{t('analytics.reactions.note')}</p>
      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <p className="adm-empty">{t('analytics.reactions.loadFailed', { message: error.message })}</p>
      ) : (
        <ol className="adm-an-events">
          {data.events.map((e) => (
            <li key={e.id} data-undo={e.delta < 0 ? true : undefined}>
              <time className="adm-an-when" dateTime={`${e.created_at.replace(' ', 'T')}Z`}>
                {eventTime(e.created_at)}
              </time>
              <span>{eventText(e)}</span>
              <span className="adm-an-ctx">
                {[
                  e.country ? countryName(e.country) : t('analytics.reactions.unknownCountry'),
                  e.referrer
                    ? t('analytics.reactions.from', { referrer: e.referrer })
                    : t('analytics.reactions.direct'),
                  e.device
                    ? EVENT_DEVICES.has(e.device)
                      ? t(`analytics.reactions.device.${e.device}`)
                      : e.device
                    : null,
                  e.locale ? (isLocale(e.locale) ? t(`analytics.langName.${e.locale}`) : e.locale) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
          <li className="adm-an-before">
            <span className="adm-an-when">
              {data.since ? t('analytics.reactions.beforeLog') : t('analytics.reactions.current')}
            </span>
            <span>
              {t('analytics.reactions.totals', {
                hearts: num(data.before_post_hearts),
                marks: num(data.before_site),
              })}
            </span>
          </li>
        </ol>
      )}
    </section>
  );
}

/**
 * 單一序列的柱狀圖：一格一根，滑過去看那格的訪客與瀏覽（提示框是 AdminTooltips 畫的）。
 * 感應區是整個欄高，不是只有柱子本身——矮的柱子才指得到。
 * 圖本身對報讀器是裝飾，旁邊有一張只給報讀器的表格。
 */
function Bars({ points, unit }: { points: AnalyticsPoint[]; unit: 'hour' | 'day' | 'week' }) {
  const { t } = useAdminT();
  if (points.length === 0) return <p className="adm-empty">{t('analytics.series.empty')}</p>;
  const max = Math.max(1, ...points.map((p) => p.visitors));
  // 軸上只標頭、中、尾三個日期
  const ticks = [
    { at: 'start', p: points[0] },
    { at: 'mid', p: points[Math.floor(points.length / 2)] },
    { at: 'end', p: points.at(-1) },
  ];
  return (
    <figure className="adm-an-chart">
      <div className="adm-an-plot" aria-hidden="true">
        <span className="adm-an-max">{num(max)}</span>
        <div className="adm-an-bars">
          {points.map((p) => (
            <div
              key={p.date}
              className="adm-an-col"
              title={t(unit === 'week' ? 'analytics.series.tipWeek' : 'analytics.series.tip', {
                date: shortDate(p.date),
                visitors: num(p.visitors),
                pageviews: num(p.pageviews),
              })}
            >
              <span className="adm-an-bar" style={{ height: `${(p.visitors / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="adm-an-axis">
          {ticks.map(({ at, p }) => (
            <span key={at}>{p ? shortDate(p.date) : ''}</span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{t(`analytics.series.caption.${unit}`)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('analytics.series.date')}</th>
            <th scope="col">{t('analytics.series.visitors')}</th>
            <th scope="col">{t('analytics.series.pageviews')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{p.date}</th>
              <td>{p.visitors}</td>
              <td>{p.pageviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** 排行：名字 + 訪客數，背後一條淡淡的長條看比例（跟第一名比） */
function Rank({
  id,
  title,
  rows,
  name,
  mono,
}: {
  id: string;
  title: string;
  rows: AnalyticsRow[];
  name: (raw: string) => string;
  mono?: boolean;
}) {
  const { t } = useAdminT();
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <section aria-labelledby={`${id}-h`} className="adm-an-rank-wrap">
      <SectionHead id={`${id}-h`}>{title}</SectionHead>
      {rows.length === 0 ? (
        <p className="adm-meta">{t('analytics.noData')}</p>
      ) : (
        <ol className="adm-an-rank">
          {rows.map((r) => (
            <li key={r.name} style={{ '--w': `${(r.visitors / top) * 100}%` } as CSSProperties}>
              <span className="adm-an-name" data-mono={mono ? true : undefined} title={name(r.name)}>
                {name(r.name)}
              </span>
              <span className="adm-an-count">{num(r.visitors)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 還沒設 key：照著做三步就好 */
function Setup() {
  const { t, i18n } = useAdminT();
  const tags = { b: <b />, code: <code /> };
  return (
    <div className="adm-an-setup">
      <p>{t('analytics.setup.intro')}</p>
      <ol>
        <li>
          <Trans t={t} i18n={i18n} i18nKey="analytics.setup.step1" components={tags} />
        </li>
        <li>
          <Trans t={t} i18n={i18n} i18nKey="analytics.setup.step2" components={tags} />
        </li>
        <li>
          <Trans t={t} i18n={i18n} i18nKey="analytics.setup.step3" components={tags} />
        </li>
      </ol>
      <p className="adm-meta">{t('analytics.setup.keyNote')}</p>
    </div>
  );
}
