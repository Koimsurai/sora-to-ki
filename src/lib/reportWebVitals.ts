// 前端 Core Web Vitals 上報（ROADMAP B4）。
//
// 哲學：量測用 Google 官方 `web-vitals` lib（CWV 的業界標準實作、不可避免），
// 但**資料送自己的 Rust 端點、存自己的 SQLite**——用它的尺、不進它的家（不碰 GA4）。
// 聚合自看：GET /api/vitals/stats。
//
// 不送任何 PII：只有 metric 名/值/rating/pathname/是否行動裝置，加上載入方式與有沒有硬體 GPU。
//
// 除了 web-vitals 的五個，還有兩個自己量的（後端 migration 0028）：
//   - TX：站內換頁的順暢度。web-vitals 只量第一次載入，換頁（這個站最在意的轉場）沒有任何實地數據
//   - BOOT：開場退場、讀者真正看到頁面的時間。LCP 算的是被開場夜色蓋住的內容，不是讀者等了多久
import { onFCP, onTTFB, type Metric } from 'web-vitals';
// CLS 與 LCP 從 attribution build 取，這兩個的問題都只在實地出現，只能靠真實讀者的瀏覽器指認：
//   - CLS 多回一個 largestShiftTarget（那次最大位移元素的 CSS 選擇器）。同一頁在無節流的本機跑
//     Lighthouse 是 CLS 0
//   - LCP 多回元素與四段時間（server 回應、資源開始載入前的等待、下載、下載完到畫出來）。
//     2026-10 大陸讀者的手機 FCP 2.6 秒、LCP 5.6 秒，模擬網路量不出中間那 3 秒卡在哪
//   - INP 多回互動的元素、互動類型與三段時間（輸入延遲、處理、畫面更新）。只有數字的話，
//     差的那幾筆是點了什麼、卡在哪一段都不知道
// FCP、TTFB 仍走精簡版，不必為它們付 attribution 的 bundle 成本。
import {
  onCLS,
  onINP,
  onLCP,
  type CLSMetricWithAttribution,
  type INPMetricWithAttribution,
  type LCPMetricWithAttribution,
} from 'web-vitals/attribution';

import { isBotUserAgent } from './bot';
import { knownHardwareGpu } from './webglSupport';
import { subscribeBoot, subscribeTransitions } from '@/store/pageTransition';

/* ── 最大位移發生在哪一頁 ──
 *
 * `send()` 讀的 pathname 是「回報當下」的，而 CLS 在 SPA 裡累加整個 page lifecycle、
 * 要到 pagehide 才定稿。實測過：在 /blog 列表產生 0.0326 的位移（側欄某段高度 229→0px），
 * 讀者接著點進文章再離開，那筆 CLS 就記在文章頁上。
 * → 資料表裡的 `path` 其實是「讀者最後停在哪」，不是「位移發生在哪」。
 *
 * 這一欄補上真正的位置。不改 CLS 本身的算法（要跟 CrUX 可比就得照樣累加整個 lifecycle），
 * 只是多帶一個診斷欄位。 */
let largestShift = { value: 0, path: '' };

function trackShiftPath() {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (e.hadRecentInput) continue;
        if (e.value > largestShift.value) largestShift = { value: e.value, path: location.pathname };
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* 不支援 layout-shift 就少一個診斷欄位，不影響上報 */
  }
}

/* ── 換頁時最長那一幀被誰吃掉 ──
 *
 * TX 只說得出「卡了幾毫秒、卡在收／飛／長哪一段」，說不出是誰。Long Animation Frames（LoAF，
 * Chromium 123 起）會列出那一幀裡跑了哪些腳本、渲染花了多久。這裡留著最近的幾個，TX 上報時
 * 拿轉場那段時間裡最長的一個做摘要。不支援的瀏覽器就沒有這一段 */
interface LoafScript {
  duration: number;
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
}
interface Loaf {
  startTime: number;
  duration: number;
  /** 這一幀開始畫（樣式、排版、繪製）的時間；0 是沒畫 */
  renderStart: number;
  scripts: LoafScript[];
}
const loafs: Loaf[] = [];
/** 留幾個就好：一趟轉場兩秒多，長幀不會超過這個數 */
const LOAF_KEEP = 30;

function trackLoaf() {
  try {
    new PerformanceObserver((list) => {
      loafs.push(...(list.getEntries() as unknown as Loaf[]));
      if (loafs.length > LOAF_KEEP) loafs.splice(0, loafs.length - LOAF_KEEP);
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    /* 不支援 LoAF 就少一段歸因 */
  }
}

/** 腳本的名字：檔名去掉 hash 與副檔名（`Collection-B3x9Qa_1.js` → `Collection`），後端只收英數與 `._-` */
function scriptName(s: LoafScript): string {
  const file = (s.sourceURL ?? '').split(/[?#]/)[0].split('/').pop() ?? '';
  const base = file.replace(/\.[a-z]+$/i, '').replace(/-[\w-]{6,}$/, '');
  // 空字串也算沒有：setTimeout 的回呼常常沒有 sourceURL，這時 invoker（TimerHandler:setTimeout）最有用
  const name = [base, s.sourceFunctionName, s.invoker, s.invokerType].find((v) => v) ?? '-';
  return name.replace(/[^\w.-]+/g, '.').slice(0, 24) || '-';
}

/**
 * [from, to] 之間最長的那一幀 → `整幀/腳本合計/渲染/最久的那段腳本`（毫秒整數）。
 * 渲染是從開始畫到這一幀結束；腳本只算 LoAF 列出來的（超過 5ms 的那些）。沒有就是空字串
 */
export function loafSummary(entries: readonly Loaf[], from: number, to: number): string {
  let worst: Loaf | null = null;
  for (const e of entries)
    if (e.startTime >= from && e.startTime <= to && (!worst || e.duration > worst.duration)) worst = e;
  if (!worst) return '';
  const ms = (v: number) => Math.max(0, Math.round(v));
  const scripts = worst.scripts.reduce((s, x) => s + x.duration, 0);
  const render = worst.renderStart > 0 ? worst.startTime + worst.duration - worst.renderStart : 0;
  const top = worst.scripts.reduce<LoafScript | null>((a, x) => (!a || x.duration > a.duration ? x : a), null);
  return `${ms(worst.duration)}/${ms(scripts)}/${ms(render)}/${top ? scriptName(top) : '-'}`;
}

/** LCP 的四段時間 → `ttfb/載入延遲/下載/繪製延遲`（毫秒整數，後端 migration 0027 的 lcp_phases） */
export function lcpPhases(a: {
  timeToFirstByte: number;
  resourceLoadDelay: number;
  resourceLoadDuration: number;
  elementRenderDelay: number;
}): string {
  return [a.timeToFirstByte, a.resourceLoadDelay, a.resourceLoadDuration, a.elementRenderDelay]
    .map((ms) => Math.max(0, Math.round(ms)))
    .join('/');
}

/** 要上報的一筆：web-vitals 的 Metric，或自己量的 TX、BOOT */
interface Beacon {
  name: string;
  value: number;
  rating: Metric['rating'];
  /** 這次載入是怎麼來的；站內換頁是 spa */
  navigationType?: string;
}

interface Attribution {
  target?: string;
  loadState?: string;
  shiftPath?: string;
  lcpPhases?: string;
  /** 各 metric 自己的細節，斜線隔開（後端只收英數與 /._-） */
  detail?: string;
}

/**
 * 自己量的兩個 metric 的好壞門檻。TX 是換頁時最長的那一幀：兩幀（60Hz 下 34ms）以內看不出來，
 * 超過 100ms 就是看得到的頓。BOOT 是開場退場的時間：開場最少停 1.1 秒、最多等 3.5 秒（layout/TransitionLayer）
 */
const rate = (v: number, good: number, poor: number): Metric['rating'] =>
  v <= good ? 'good' : v > poor ? 'poor' : 'needs-improvement';
const TX_GOOD = 34;
const TX_POOR = 100;
const BOOT_GOOD = 2000;
const BOOT_POOR = 3500;

/** 這次頁面載入的方式（Navigation Timing 的寫法是底線，web-vitals 跟後端用連字號） */
function loadNavType(): string | undefined {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type.replace('_', '-');
}

function send(m: Beacon, attr?: Attribution) {
  const path = window.location.pathname;
  // 後台不上報：/admin 有 auth、robots.txt 也 Disallow，不是讀者體驗的一部分；而編輯器
  // （大量 textarea + 即時預覽 + 非同步載入的清單）天生就會位移，混進來會蓋掉文章頁的真實
  // 數字——實測 /admin/posts 的 CLS p75=0.173、93% 超標，一個人在編輯就足以主導全站 p75。
  //
  // 擋在 send() 而不是 initWebVitals()：這是 SPA，init 整個 session 只跑一次，但每個 metric
  // 是在自己定稿時機才讀當下的 pathname。擋在 init 的話，從首頁進站再切到後台照樣會上報；
  // 反過來從後台進站再去看文章，連文章的數字都會一起丟掉。
  if (path === '/admin' || path.startsWith('/admin/')) return;
  const body = JSON.stringify({
    metric: m.name,
    value: m.value,
    rating: m.rating,
    path,
    isMobile: window.matchMedia('(max-width: 768px)').matches,
    navType: m.navigationType,
    // 有沒有硬體 GPU 是效能差最多的分界（沒有的話整站關掉 3D 與毛玻璃）；還沒探測完就不帶
    gpu: ((g) => (g === null ? undefined : g ? 'hw' : 'none'))(knownHardwareGpu()),
    ...attr,
  });
  // sendBeacon：頁面卸載期也保證送達（LCP/CLS 在 pagehide 才定稿）。
  // Blob 帶 content-type 讓 axum 的 Json extractor 收得進。
  const blob = new Blob([body], { type: 'application/json' });
  // sendBeacon 全瀏覽器都有，?. 是死碼；但回傳 false（佇列滿/payload 過大）要退 fetch，! 保留。
  if (!navigator.sendBeacon('/api/vitals', blob)) {
    void fetch('/api/vitals', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {
      /* 量測丟失無妨，不干擾使用者 */
    });
  }
}

let initialized = false;

/** client-only、每頁面生命週期一次。各 metric 由 web-vitals 在定稿時機自行回呼。 */
export function initWebVitals() {
  if (initialized) return;
  // 爬蟲不上報：它的渲染環境沒有真實使用者互動、又常跑在受限機器上，測出來的數字會污染 p75。
  // 另外 Googlebot 渲染時對 /api/vitals 發的 POST 會在 GSC 網址審查裡變成一筆「其他錯誤」。
  if (isBotUserAgent(navigator.userAgent)) return;
  initialized = true;
  trackShiftPath();
  trackLoaf();
  onCLS((m: CLSMetricWithAttribution) => {
    const a = m.attribution;
    send(m, {
      target: a.largestShiftTarget,
      loadState: a.loadState,
      // 空字串（沒有任何位移）不送，讓後端存 NULL 而不是 ''
      shiftPath: largestShift.path || undefined,
    });
  });
  onINP((m: INPMetricWithAttribution) => {
    const a = m.attribution;
    const ms = (v: number) => Math.max(0, Math.round(v));
    send(m, {
      target: a.interactionTarget || undefined,
      loadState: a.loadState,
      detail: `${a.interactionType}/${ms(a.inputDelay)}/${ms(a.processingDuration)}/${ms(a.presentationDelay)}`,
    });
  });
  onLCP((m: LCPMetricWithAttribution) => {
    send(m, { target: m.attribution.target, lcpPhases: lcpPhases(m.attribution) });
  });
  onFCP(send);
  onTTFB(send);
  // 站內換頁：值是最長那一幀；target 記從哪頁到哪頁。細節是
  //   幀數/長幀數/總時長/收、飛、長各自最長的一幀/LoAF 的摘要（loafSummary，不支援就沒有這四欄）
  // 前三欄的位置不變（migration 0028 寫的格式），舊的資料照樣讀得懂
  subscribeTransitions((r) => {
    const now = performance.now();
    const loaf = loafSummary(loafs, now - r.ms, now);
    const phases = [r.phases.leave, r.phases.fly, r.phases.grow].map((v) => Math.round(v)).join('/');
    send(
      { name: 'TX', value: Math.round(r.maxFrame), rating: rate(r.maxFrame, TX_GOOD, TX_POOR), navigationType: 'spa' },
      {
        target: `${r.from} → ${r.to}`,
        detail: [r.frames, r.long, Math.round(r.ms), phases, loaf].filter((v) => v !== '').join('/'),
      },
    );
  });
  // 開場退場：從這次載入開始過了多久；首頁有沒有等到 3D 土星交棒
  subscribeBoot((r) => {
    send(
      {
        name: 'BOOT',
        value: Math.round(r.at),
        rating: rate(r.at, BOOT_GOOD, BOOT_POOR),
        navigationType: loadNavType(),
      },
      // collapse/開始跑/等完/最後等到的那一項，例如 collapse/1840/2650/load（後端的 detail 只收英數與 /._-）
      { detail: `${r.end}/${Math.round(r.startedAt)}/${Math.round(r.waitedAt)}/${r.waitedFor}` },
    );
  });
}
