import { useQuery } from '@tanstack/react-query';
import type { AnalyticsPoint, AnalyticsResponse, AnalyticsRow } from '@koimsurai/api-types';
import { useState, type CSSProperties } from 'react';

import { adminAnalyticsQueryOptions, type AnalyticsPeriod } from '@/data/adminData';
import AdminLoading from './AdminLoading';
import { PageHead, SectionHead, TabPanel } from './AdminPage';
import './AdminAnalytics.css';

// 流量：自架 Plausible 的數字，畫成後台自己的樣子（後端代理 Stats API，見 handlers/analytics.rs）。
// 一張每日訪客的柱狀圖、四個總數、四張排行（頁面、來源、國家、裝置）。
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

function Report({ data, period }: { data: AnalyticsResponse; period: AnalyticsPeriod }) {
  const t = data.totals;
  const unit = period === '6mo' ? '每週' : '每日';
  return (
    <div className="adm-an-report">
      <div className="adm-tiles" aria-label="總數">
        <div className="adm-tile">
          <span className="adm-caps">訪客</span>
          <span className="adm-tile-num">{num(t.visitors)}</span>
          <span className="adm-tile-sub">不重複的人</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">瀏覽</span>
          <span className="adm-tile-num">{num(t.pageviews)}</span>
          <span className="adm-tile-sub">造訪 {num(t.visits)} 次</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">平均停留</span>
          {/* 浮點數的欄位在型別上可能是 null（NaN 序列化成 null），當 0 */}
          <span className="adm-tile-num">
            <Duration sec={t.visit_duration ?? 0} />
          </span>
          <span className="adm-tile-sub">每次造訪</span>
        </div>
        <div className="adm-tile">
          <span className="adm-caps">跳出率</span>
          <span className="adm-tile-num">
            {Math.round(t.bounce_rate ?? 0)}
            <span className="adm-an-unit">%</span>
          </span>
          <span className="adm-tile-sub">只看一頁就走</span>
        </div>
      </div>

      <section aria-labelledby="an-series-h">
        <SectionHead id="an-series-h">{unit}訪客</SectionHead>
        <Bars points={data.series} unit={unit} />
      </section>

      <div className="adm-an-grid">
        <Rank id="an-pages" title="熱門頁面" rows={data.pages} name={label.page} mono />
        <Rank id="an-sources" title="從哪裡來" rows={data.sources} name={label.source} />
        <Rank id="an-countries" title="國家" rows={data.countries} name={label.country} />
        <Rank id="an-devices" title="裝置" rows={data.devices} name={label.device} />
      </div>
    </div>
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
