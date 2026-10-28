import { useQuery } from '@tanstack/react-query';
import type { AnalyticsPoint, AnalyticsResponse, AnalyticsRow, PostPerf, ReactionLogEvent } from '@koimsurai/api-types';
import { useState, type CSSProperties } from 'react';

import { adminAnalyticsQueryOptions, adminReactionsQueryOptions, type AnalyticsPeriod } from '@/data/adminData';
import AdminLoading from './AdminLoading';
import { PageHead, SectionHead, TabPanel } from './AdminPage';
import './AdminAnalytics.css';

// 流量：自架 Plausible 的數字，畫成後台自己的樣子（後端代理 Stats API，見 handlers/analytics.rs）。
// 不直接攤統計術語，而是回答幾個問題：來了多少人、比上一段多還少；每篇文章有沒有人讀完；
// 從哪裡來、先看了什麼；在 Google 搜了什麼（Search Console）；收到哪些愛心與反應（reaction_log）。
// 每個數字旁邊一句白話說明。國家、裝置、熱門頁面收在最後。
// 站長自己的瀏覽不會進來：後台開過的瀏覽器會設 plausible_ignore（AdminLayout），
// 以前留下的後台瀏覽在熱門頁面裡也濾掉了。

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
  { key: '6mo', label: '半年' },
];

const num = (n: number) => n.toLocaleString('zh-TW');

/**
 * 秒 → 「2分05秒」。數字是等寬大字，單位縮成小字——
 * 中文單位放進等寬字裡會被撐成跟數字一樣寬，「2 分 28 秒」讀起來像四個數字
 */
function Duration({ sec }: { sec: number }) {
  const s = Math.round(sec);
  const unit = (u: string) => <span className="adm-an-unit">{u}</span>;
  if (s < 60)
    return (
      <>
        {s}
        {unit('秒')}
      </>
    );
  return (
    <>
      {Math.floor(s / 60)}
      {unit('分')}
      {String(s % 60).padStart(2, '0')}
      {unit('秒')}
    </>
  );
}

/** `2026-10-26` → `10.26`（不經過 Date：字串本來就是站台時區的日期） */
const shortDate = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['zh-TW'], { type: 'region' });
  } catch {
    return null;
  }
})();

const DEVICE: Record<string, string> = { Desktop: '桌機', Laptop: '筆電', Mobile: '手機', Tablet: '平板' };

/**
 * 兩碼的地區代碼 → 中文國名。`Intl.DisplayNames` 拿到不合格的代碼會丟 RangeError（不是回 undefined），
 * 一個怪值就讓整頁掛掉：查不到國家的訪客 Plausible 回的是兩個 NUL（後端已經濾掉，這裡再擋一次）
 */
function countryName(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '不明';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const label = {
  page: (n: string) => n,
  source: (n: string) => (n === 'Direct / None' ? '直接造訪' : n),
  country: countryName,
  device: (n: string) => DEVICE[n] ?? n,
};

export default function AdminAnalytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const { data, isPending, error } = useQuery(adminAnalyticsQueryOptions(period));

  const live = data?.configured && data.realtime !== null ? `此刻 ${data.realtime} 人在站上` : '來源 Plausible';
  return (
    <div className="adm-page">
      <PageHead
        title="流量"
        latin="Traffic"
        meta={isPending ? '載入中' : live}
        actions={
          data?.configured && (
            <a className="adm-btn" href={data.dashboard_url} target="_blank" rel="noreferrer">
              在 Plausible 打開 ↗
            </a>
          )
        }
      />

      <section className="adm-stack" aria-label="流量">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="adm-tab"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={period}>
          {isPending ? (
            <AdminLoading />
          ) : error ? (
            <p className="adm-empty">讀不到 Plausible：{error.message}</p>
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

const PERIOD_WORD: Record<AnalyticsPeriod, string> = { '7d': '7 天', '30d': '30 天', '6mo': '半年' };

/** 這一段跟上一段比：倍數、百分比或差不多 */
function compare(now: number, prev: number): string {
  if (prev <= 0) return now > 0 ? '上一段還沒有人來' : '';
  const r = now / prev;
  if (r >= 2) return `是上一段的 ${Math.round(r)} 倍`;
  if (r >= 1.05) return `比上一段多 ${Math.round((r - 1) * 100)}%`;
  if (r <= 0.95) return `比上一段少 ${Math.round((1 - r) * 100)}%`;
  return '跟上一段差不多';
}

/** 一句話：來了多少人、比上一段多還少、主要從哪來 */
function Summary({ data, period }: { data: AnalyticsResponse; period: AnalyticsPeriod }) {
  const v = data.totals.visitors;
  const cmp = compare(v, data.previous.visitors);
  const top = data.sources.at(0);
  const share = top && v > 0 ? top.visitors / v : 0;
  const how = top?.name === 'Direct / None' ? '直接造訪' : top ? `從 ${label.source(top.name)} 來的` : '';
  const from =
    top && share >= 0.4
      ? `${share >= 0.95 ? '幾乎都' : `${Math.floor(share * 10)} 成`}是${how}（${num(top.visitors)} 人）。`
      : '';
  return (
    <p className="adm-an-summary">
      這 {PERIOD_WORD[period]}有 <b>{num(v)}</b> 人來{cmp ? `，${cmp}` : ''}。{from}
    </p>
  );
}

/** 跟上一段比的那一行：↑／↓ 與上一段的數字；看得出好壞的（跳出率越低越好）多一個「變好／變差」 */
function Delta({
  now,
  prev,
  fmt,
  lowerIsBetter,
}: {
  now: number;
  prev: number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  if (!prev) return <span className="adm-an-delta">上一段沒有資料</span>;
  const same = Math.abs(now - prev) < 0.005 * Math.max(1, Math.abs(prev));
  const up = now > prev;
  const verdict = same || lowerIsBetter === undefined ? '' : up === !lowerIsBetter ? '，變好' : '，變差';
  return (
    <span className="adm-an-delta">
      {same ? '＝' : up ? '↑' : '↓'} 上一段 {fmt(prev)}
      {verdict}
    </span>
  );
}

const durationText = (sec: number) => {
  const s = Math.round(sec);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
};

function Report({ data, period }: { data: AnalyticsResponse; period: AnalyticsPeriod }) {
  const t = data.totals;
  const p = data.previous;
  const unit = period === '6mo' ? '每週' : '每天';
  return (
    <div className="adm-an-report">
      <Summary data={data} period={period} />

      <div className="adm-tiles" aria-label="總數">
        <div className="adm-tile">
          <span className="adm-caps">來的人</span>
          <span className="adm-tile-num">{num(t.visitors)}</span>
          <Delta now={t.visitors} prev={p.visitors} fmt={num} />
          <span className="adm-tile-sub">不重複的人數。同一個人同一天來好幾次只算一次。</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">每人看幾頁</span>
          <span className="adm-tile-num">{(t.views_per_visit ?? 0).toFixed(1)}</span>
          <Delta now={t.views_per_visit ?? 0} prev={p.views_per_visit ?? 0} fmt={(n) => n.toFixed(1)} />
          <span className="adm-tile-sub">每次進站平均看了幾頁。越高代表越多人會繼續逛。</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">只看一頁就走</span>
          {/* 浮點數的欄位在型別上可能是 null（NaN 序列化成 null），當 0 */}
          <span className="adm-tile-num">
            {Math.round(t.bounce_rate ?? 0)}
            <span className="adm-an-unit">%</span>
          </span>
          <Delta now={t.bounce_rate ?? 0} prev={p.bounce_rate ?? 0} fmt={(n) => `${Math.round(n)}%`} lowerIsBetter />
          <span className="adm-tile-sub">原本的「跳出率」：看完第一頁就離開的人占多少。越低越好。</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">每次待多久</span>
          <span className="adm-tile-num">
            <Duration sec={t.visit_duration ?? 0} />
          </span>
          <Delta now={t.visit_duration ?? 0} prev={p.visit_duration ?? 0} fmt={durationText} />
          <span className="adm-tile-sub">從進站到離開大概多久（一次造訪的平均）。</span>
        </div>
      </div>

      <section aria-labelledby="an-series-h">
        <SectionHead id="an-series-h">{unit}來的人</SectionHead>
        <Bars points={data.series} unit={unit} />
      </section>

      <Posts data={data} />
      <Sources data={data} />
      <Search data={data} />
      <Reactions />

      <details className="adm-an-more">
        <summary>熱門頁面、國家與裝置</summary>
        <div className="adm-an-grid">
          <Rank id="an-pages" title="熱門頁面" rows={data.pages} name={label.page} mono />
          <Rank id="an-countries" title="國家" rows={data.countries} name={label.country} />
          <Rank id="an-devices" title="裝置" rows={data.devices} name={label.device} />
        </div>
        <p className="adm-an-note">國家是照連線位置判斷的，讀者用 VPN 或代理時會算成那一端的國家，只能當參考。</p>
      </details>
    </div>
  );
}

const LOCALE_WORD: Record<string, string> = { 'zh-cn': '簡中', en: '英文', ja: '日文', ko: '韓文' };

/** 進站頁的網址 → 讀得懂的名字：首頁、手記、文章標題，各語系標在後面 */
function pageName(path: string, posts: PostPerf[]): string {
  const segs = path.split(/[?#]/)[0].split('/').filter(Boolean);
  const loc = segs[0] && LOCALE_WORD[segs[0]] ? (segs.shift() ?? '') : '';
  const suffix = loc ? `（${LOCALE_WORD[loc]}）` : '';
  if (segs.length === 0) return `首頁${suffix}`;
  if (segs[0] === 'blog' && segs.length === 1) return `手記${suffix}`;
  if (segs[0] === 'blog') {
    const post = posts.find((p) => p.slug === segs[1] || String(p.id) === segs[1]);
    return post ? `《${post.title}》${suffix}` : path;
  }
  return path;
}

/** 每篇文章：看的人、捲到、停留、讀完要多久、愛心、留言 */
function Posts({ data }: { data: AnalyticsResponse }) {
  return (
    <section aria-labelledby="an-posts-h" className="adm-stack">
      <SectionHead id="an-posts-h">每篇文章</SectionHead>
      <p className="adm-an-note">
        「平均停留」是每次打開這篇到離開的平均（分頁在背景的時間不算），「讀完要」是照字數估的閱讀時間，兩個差很多代表多數人只看了開頭。
        「捲到」是畫面最遠到過全文的幾成，跳到底部、從目錄跳到後面也算到過，所以會比實際讀到的多。各語系的同一篇合在一起算；愛心與留言是全部的，不限這段期間。
      </p>
      {data.posts.length === 0 ? (
        <p className="adm-meta">這段期間還沒有人看文章。</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table adm-an-posts">
            <thead>
              <tr>
                <th scope="col">文章</th>
                <th scope="col">看的人</th>
                <th scope="col">捲到</th>
                <th scope="col">平均停留</th>
                <th scope="col">讀完要</th>
                <th scope="col">愛心</th>
                <th scope="col">留言</th>
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
                  <td>{p.read_minutes} 分</td>
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
  return (
    <section aria-labelledby="an-src-h" className="adm-stack">
      <SectionHead id="an-src-h">從哪裡來，先看了什麼</SectionHead>
      <p className="adm-an-note">
        「直接造訪」是沒有帶來源的：書籤、自己打網址，或某些通訊軟體點開的連結（LINE、Discord 有時不帶來源）。
      </p>
      {data.entries.length === 0 ? (
        <p className="adm-meta">還沒有資料。</p>
      ) : (
        <div className="adm-an-sources">
          {data.entries.map((s) => (
            <div key={s.source} className="adm-an-src">
              <div className="adm-an-src-head">
                <span>{label.source(s.source)}</span>
                <span className="adm-an-count">{num(s.visitors)} 人</span>
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
  const s = data.search;
  return (
    <section aria-labelledby="an-search-h" className="adm-stack">
      <SectionHead id="an-search-h">在 Google 搜了什麼</SectionHead>
      {!s.configured ? (
        <p className="adm-an-note">
          還沒接上 Search Console：在 <code>docker-compose.yml</code> 把服務帳號金鑰掛進後端，並設{' '}
          <code>GSC_SERVICE_ACCOUNT_FILE</code>（見 <code>backend/src/handlers/search_console.rs</code>）。
        </p>
      ) : s.error ? (
        <p className="adm-empty">讀不到 Search Console：{s.error}</p>
      ) : (
        <>
          <p className="adm-an-note">
            「出現」是這站在搜尋結果裡被看到幾次，「點擊」是有幾次點進來。Google 的資料大約晚兩三天，最近幾天會比較少。
          </p>
          {s.queries.length === 0 ? (
            <p className="adm-meta">這段期間沒有搜尋資料。</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table adm-an-posts">
                <thead>
                  <tr>
                    <th scope="col">搜尋的字</th>
                    <th scope="col">點擊</th>
                    <th scope="col">出現</th>
                    <th scope="col">點擊率</th>
                    <th scope="col">平均排在第幾</th>
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

const DEVICE_WORD: Record<string, string> = { mobile: '手機', desktop: '電腦' };
const LOCALE_NAME: Record<string, string> = { 'zh-TW': '繁中', 'zh-CN': '簡中', en: '英文', ja: '日文', ko: '韓文' };

/** 後端存的是 UTC 的 `yyyy-MM-dd HH:mm:ss` → 台北時間 `10.28 21:14` */
function eventTime(utc: string): string {
  const d = new Date(`${utc.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return utc;
  const parts = new Intl.DateTimeFormat('zh-TW', {
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
  const title = e.target_title ?? '（已刪除）';
  const undo = e.delta < 0;
  switch (e.kind) {
    case 'post':
      return undo ? `收回了 ${e.value}，在《${title}》` : `在《${title}》按了 ${e.value}`;
    case 'site':
      return '在首頁留下印記';
    case 'comment':
      return `幫《${title}》的一則留言按讚`;
    case 'thought': {
      const what = e.value === 'dislike' ? '不喜歡' : '喜歡';
      return undo ? `收回了對碎念「${title}」的${what}` : `${what}碎念「${title}」`;
    }
    default:
      return `${e.kind} ${e.value}`;
  }
}

/** 收到的愛心與反應：最近的在上面，最後一行是開始記錄之前的總數 */
function Reactions() {
  const { data, isPending, error } = useQuery(adminReactionsQueryOptions);
  return (
    <section aria-labelledby="an-react-h" className="adm-stack">
      <SectionHead id="an-react-h">收到的愛心與反應</SectionHead>
      <p className="adm-an-note">
        每一次按愛心、表情、留言的讚、碎念的喜歡都記一筆，收回也記。不記身分與 IP：國家是 Cloudflare
        判斷的，來源是讀者從哪個網站連進來的。
      </p>
      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <p className="adm-empty">讀不到紀錄：{error.message}</p>
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
                  e.country ? countryName(e.country) : '國家不明',
                  e.referrer ? `從 ${e.referrer}` : '直接造訪',
                  e.device ? (DEVICE_WORD[e.device] ?? e.device) : null,
                  e.locale ? (LOCALE_NAME[e.locale] ?? e.locale) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
          <li className="adm-an-before">
            <span className="adm-an-when">{data.since ? '開始記錄之前' : '目前'}</span>
            <span>
              文章收到 {num(data.before_post_hearts)} 顆愛心、首頁留下 {num(data.before_site)}{' '}
              個印記（只有總數，沒有細節）
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
function Bars({ points, unit }: { points: AnalyticsPoint[]; unit: string }) {
  if (points.length === 0) return <p className="adm-empty">這段期間沒有資料。</p>;
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
              title={`${shortDate(p.date)}${unit === '每週' ? ' 那週' : ''} · 訪客 ${num(p.visitors)} · 瀏覽 ${num(p.pageviews)}`}
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
        <caption>{unit}訪客與瀏覽</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">訪客</th>
            <th scope="col">瀏覽</th>
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
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <section aria-labelledby={`${id}-h`} className="adm-an-rank-wrap">
      <SectionHead id={`${id}-h`}>{title}</SectionHead>
      {rows.length === 0 ? (
        <p className="adm-meta">還沒有資料。</p>
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
  return (
    <div className="adm-an-setup">
      <p>還沒接上 Plausible。後端需要一把 Stats API 的 key：</p>
      <ol>
        <li>
          打開 Plausible，右上角頭像 → <b>Account Settings</b> → <b>API Keys</b> → <b>New API Key</b>， 類型選{' '}
          <b>Stats API</b>。
        </li>
        <li>
          把 key 加進伺服器的 <code>.env.backend</code>：<code>PLAUSIBLE_API_KEY=…</code>
          （Plausible 裡的站台名稱不是 <code>koimsurai.com</code> 的話，再加一行 <code>PLAUSIBLE_SITE_ID=…</code>）
        </li>
        <li>
          重啟後端：<code>docker compose up -d backend-rs</code>
        </li>
      </ol>
      <p className="adm-meta">key 只在後端，不會進前端的程式碼。</p>
    </div>
  );
}
