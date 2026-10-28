// @vitest-environment jsdom
//
// Core Web Vitals 上報。
//
// 為什麼是這一支：行覆蓋 54% 但**分支只有 13%**，而它壞掉的方式是全站最安靜的
// ——實地數據就是靜靜地停止或變髒，站上沒有任何症狀。而 CLAUDE.md 寫得很清楚：
// 文章頁真正的 CLS **只在「重新整理且捲在深處」時出現**，Lighthouse 那種「載入一次
// 量一次」的工具永遠測不到，所以這條上報是唯一的來源。它壞了等於那個問題從此看不見。
//
// 這裡蓋的每一條都對應原始碼註解裡記著的一次真實決定或事故，而那些註解是唯一的守衛。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

/** web-vitals 的回呼在 init 時註冊，測試自己決定什麼時候「定稿」 */
interface Cbs {
  cls?: (m: unknown) => void;
  inp?: (m: unknown) => void;
  lcp?: (m: unknown) => void;
  fcp?: (m: unknown) => void;
  ttfb?: (m: unknown) => void;
}
let cbs: Cbs = {};
let isBot = false;
let gpu: boolean | null = null;

vi.mock('web-vitals', () => ({
  onFCP: (f: (m: unknown) => void) => {
    cbs.fcp = f;
  },
  onTTFB: (f: (m: unknown) => void) => {
    cbs.ttfb = f;
  },
}));
vi.mock('web-vitals/attribution', () => ({
  onCLS: (f: (m: unknown) => void) => {
    cbs.cls = f;
  },
  onINP: (f: (m: unknown) => void) => {
    cbs.inp = f;
  },
  onLCP: (f: (m: unknown) => void) => {
    cbs.lcp = f;
  },
}));
vi.mock('./bot', () => ({ isBotUserAgent: () => isBot }));
vi.mock('./webglSupport', () => ({ knownHardwareGpu: () => gpu }));

/** sendBeacon 收到的東西 */
let beacons: { url: string; body: string }[] = [];
let beaconOk = true;
let fetchCalls: { url: string; init: RequestInit }[] = [];
/** trackShiftPath 註冊的 layout-shift observer 回呼 */
let shiftObserver: ((list: { getEntries: () => unknown[] }) => void) | null = null;

async function load() {
  vi.resetModules();
  cbs = {};
  beacons = [];
  fetchCalls = [];
  shiftObserver = null;

  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(f: (list: { getEntries: () => unknown[] }) => void) {
        shiftObserver = f;
      }
      observe() {
        /* 測試自己叫 shiftObserver */
      }
    },
  );
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, blob: Blob) => {
      // Blob.text() 是 async，但這裡的斷言要同步拿得到 —— 直接讀我們自己塞進去的字串
      beacons.push({ url, body: (blob as Blob & { __body: string }).__body });
      return beaconOk;
    },
  });
  // 記下原始字串，省得為了讀 Blob 讓每個測試都變 async
  const RealBlob = globalThis.Blob;
  vi.stubGlobal(
    'Blob',
    class extends RealBlob {
      __body: string;
      constructor(parts: string[], opts?: BlobPropertyBag) {
        super(parts, opts);
        this.__body = parts.join('');
      }
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return Promise.resolve({ ok: true });
    }),
  );

  const mod = await import('./reportWebVitals');
  return mod.initWebVitals;
}

const metric = (over: Record<string, unknown> = {}) => ({
  name: 'LCP',
  value: 1234.5,
  rating: 'good',
  // LCP 走 attribution build，回呼會讀這個；其他 metric 不看它
  attribution: {
    target: 'main>h1',
    timeToFirstByte: 400,
    resourceLoadDelay: 0,
    resourceLoadDuration: 0,
    elementRenderDelay: 834.5,
  },
  ...over,
});

const lastBody = () => JSON.parse(beacons.at(-1)?.body ?? '{}') as Record<string, unknown>;
const goTo = (path: string) => {
  window.history.replaceState({}, '', path);
};

beforeEach(() => {
  isBot = false;
  beaconOk = true;
  goTo('/blog/1');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('誰不該被上報', () => {
  // ⚠ 註解記著的事故：/admin/posts 的 CLS p75=0.173、93% 超標——編輯器天生就會位移
  // （大量 textarea + 即時預覽 + 非同步清單），一個人在編輯就足以主導全站 p75。
  it('後台的數字一律不送', async () => {
    const init = await load();
    init();
    for (const p of ['/admin', '/admin/posts', '/admin/posts/edit/1']) {
      goTo(p);
      cbs.lcp?.(metric());
    }
    expect(beacons).toHaveLength(0);
  });

  // ⚠ 這條守的是「擋在 send() 而不是 initWebVitals()」這個決定，原始碼有整段註解解釋：
  // 這是 SPA，init 整個 session 只跑一次，但每個 metric 在自己定稿時才讀當下的 pathname。
  // 擋在 init 的話，從首頁進站再切到後台照樣會上報；反過來從後台進站再去看文章，
  // 連文章的數字都會一起丟掉。
  it('同一個 session 裡逐筆判斷：首頁進站後切到後台不送，後台進站後看文章要送', async () => {
    const init = await load();

    goTo('/'); // 從首頁進站
    init();
    goTo('/admin/posts');
    cbs.lcp?.(metric());
    expect(beacons, '切到後台之後那筆不該送').toHaveLength(0);

    goTo('/blog/42'); // 再回到文章
    cbs.inp?.(metric({ name: 'INP' }));
    expect(beacons, '回到文章的那筆要送').toHaveLength(1);
    expect(lastBody().path).toBe('/blog/42');
  });

  // 爬蟲的渲染環境沒有真實互動、又常跑在受限機器上，數字會污染 p75；
  // 而且 Googlebot 對 /api/vitals 發的 POST 會在 GSC 網址審查裡變成一筆「其他錯誤」。
  it('爬蟲連監聽器都不註冊', async () => {
    isBot = true;
    const init = await load();
    init();
    expect(cbs.lcp).toBeUndefined();
    expect(cbs.cls).toBeUndefined();
  });

  it('重複呼叫 init 只註冊一次（SPA 換頁不該疊加監聽器）', async () => {
    const init = await load();
    init();
    const first = cbs.lcp;
    cbs.lcp = undefined;
    init();
    expect(cbs.lcp, '第二次 init 不該再註冊').toBeUndefined();
    expect(first).toBeTypeOf('function');
  });
});

describe('送出去的內容', () => {
  it('打的是 /api/vitals，帶著 metric 的名稱／值／評級與路徑', async () => {
    const init = await load();
    init();
    goTo('/blog/7');
    cbs.lcp?.(metric({ name: 'LCP', value: 2500, rating: 'needs-improvement' }));

    expect(beacons.at(-1)?.url).toBe('/api/vitals');
    expect(lastBody()).toMatchObject({
      metric: 'LCP',
      value: 2500,
      rating: 'needs-improvement',
      path: '/blog/7',
    });
  });

  // ⚠ 檔頭寫著「不送任何 PII：只有 metric 名/值/rating/pathname/是否行動裝置」。
  // 多送一個欄位不會有任何症狀，所以用白名單釘住——這是那句承諾唯一的守衛。
  it('欄位是白名單，不會夾帶任何多餘的東西', async () => {
    const allowed = new Set([
      'metric',
      'value',
      'rating',
      'path',
      'isMobile',
      'target',
      'loadState',
      'shiftPath',
      'lcpPhases',
      'navType',
      'detail',
      'gpu',
    ]);
    const init = await load();
    init();
    cbs.lcp?.(metric());
    cbs.cls?.({
      ...metric({ name: 'CLS', value: 0.1 }),
      attribution: { largestShiftTarget: '#a', loadState: 'complete' },
    });

    for (const b of beacons) {
      for (const k of Object.keys(JSON.parse(b.body) as Record<string, unknown>)) {
        expect(allowed, `不該出現的欄位：${k}`).toContain(k);
      }
    }
  });

  it('四個非 CLS 的 metric 都會送', async () => {
    const init = await load();
    init();
    cbs.inp?.(metric({ name: 'INP' }));
    cbs.lcp?.(metric({ name: 'LCP' }));
    cbs.fcp?.(metric({ name: 'FCP' }));
    cbs.ttfb?.(metric({ name: 'TTFB' }));
    expect(beacons.map((b) => (JSON.parse(b.body) as { metric: string }).metric)).toEqual([
      'INP',
      'LCP',
      'FCP',
      'TTFB',
    ]);
  });
});

describe('CLS 的診斷欄位', () => {
  // target 是「那次最大位移的元素選擇器」，CLAUDE.md 說它與 shift_path 兩欄是實地歸因的
  // 唯一來源——CLS 只在實地出現，本機與 Lighthouse 都測不到。
  it('attribution 的 largestShiftTarget / loadState 會一起送', async () => {
    const init = await load();
    init();
    cbs.cls?.({
      ...metric({ name: 'CLS', value: 0.42 }),
      attribution: { largestShiftTarget: 'div.toc-item', loadState: 'dom-interactive' },
    });
    expect(lastBody()).toMatchObject({ target: 'div.toc-item', loadState: 'dom-interactive' });
  });

  // ⚠ 註解記著的實測：在 /blog 產生 0.0326 的位移，讀者接著點進文章再離開，
  // 那筆 CLS 就記在文章頁上——`path` 是「讀者最後停在哪」，不是「位移發生在哪」。
  // shiftPath 這一欄就是為了補上真正的位置。
  it('shiftPath 記的是位移發生的那一頁，不是回報當下的頁', async () => {
    const init = await load();
    goTo('/blog'); // 位移發生在列表頁
    init();
    shiftObserver?.({ getEntries: () => [{ value: 0.03, hadRecentInput: false }] });

    goTo('/blog/42'); // 讀者點進文章才離開
    cbs.cls?.({ ...metric({ name: 'CLS' }), attribution: {} });

    expect(lastBody().path, 'path 是最後停留的頁').toBe('/blog/42');
    expect(lastBody().shiftPath, 'shiftPath 是位移真正發生的頁').toBe('/blog');
  });

  it('只記最大的那次位移', async () => {
    const init = await load();
    goTo('/a');
    init();
    shiftObserver?.({ getEntries: () => [{ value: 0.01, hadRecentInput: false }] });
    goTo('/b');
    shiftObserver?.({ getEntries: () => [{ value: 0.3, hadRecentInput: false }] });
    goTo('/c');
    shiftObserver?.({ getEntries: () => [{ value: 0.02, hadRecentInput: false }] });
    cbs.cls?.({ ...metric({ name: 'CLS' }), attribution: {} });
    expect(lastBody().shiftPath).toBe('/b');
  });

  // 使用者互動後 500ms 內的位移不算進 CLS（規格如此），診斷欄位也不該記
  it('hadRecentInput 的位移不列入', async () => {
    const init = await load();
    goTo('/a');
    init();
    shiftObserver?.({ getEntries: () => [{ value: 0.9, hadRecentInput: true }] });
    cbs.cls?.({ ...metric({ name: 'CLS' }), attribution: {} });
    expect(lastBody().shiftPath).toBeUndefined();
  });

  // 空字串要變成「不送這個欄位」，後端才會存 NULL 而不是 ''。
  // 存成 '' 的話「沒有位移」與「位移在根路徑」在報表上分不出來。
  it('完全沒有位移時不送 shiftPath 這個欄位', async () => {
    const init = await load();
    init();
    cbs.cls?.({ ...metric({ name: 'CLS' }), attribution: {} });
    expect('shiftPath' in lastBody()).toBe(false);
  });
});

describe('LCP 的診斷欄位', () => {
  it('帶上 LCP 元素與四段時間（毫秒取整、斜線隔開，後端只收這個格式）', async () => {
    (await load())();
    cbs.lcp?.(
      metric({
        attribution: {
          target: 'section.hero>h1',
          timeToFirstByte: 1993.4,
          resourceLoadDelay: 120.6,
          resourceLoadDuration: 300,
          elementRenderDelay: 3100.2,
        },
      }),
    );
    expect(lastBody().target).toBe('section.hero>h1');
    expect(lastBody().lcpPhases).toBe('1993/121/300/3100');
  });

  it('負數夾成 0：後端看到負號會整欄當沒帶', async () => {
    const { lcpPhases } = await import('./reportWebVitals');
    expect(
      lcpPhases({ timeToFirstByte: -0.2, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 10 }),
    ).toBe('0/0/0/10');
  });

  it('其他 metric 不帶 lcpPhases', async () => {
    (await load())();
    cbs.fcp?.(metric({ name: 'FCP' }));
    expect(lastBody().lcpPhases).toBeUndefined();
    expect(lastBody().target).toBeUndefined();
  });
});

describe('INP 的診斷欄位', () => {
  it('帶上互動的元素、載入階段，細節是 類型/輸入延遲/處理/畫面更新（毫秒取整、負數夾成 0）', async () => {
    const init = await load();
    init();
    cbs.inp?.({
      name: 'INP',
      value: 312,
      rating: 'poor',
      navigationType: 'navigate',
      attribution: {
        interactionTarget: 'nav.snav>a',
        interactionType: 'pointer',
        loadState: 'complete',
        inputDelay: 12.4,
        processingDuration: 250.6,
        presentationDelay: -1,
      },
    });
    expect(lastBody()).toMatchObject({
      metric: 'INP',
      target: 'nav.snav>a',
      loadState: 'complete',
      detail: 'pointer/12/251/0',
      navType: 'navigate',
    });
  });
});

describe('自己量的 TX（換頁順暢度）與 BOOT（開場）', () => {
  it('換頁跑完送 TX：值是最長那一幀，細節是 幀數/長幀數/總時長，target 是從哪頁到哪頁', async () => {
    const init = await load();
    const { reportTransition } = await import('@/store/pageTransition');
    init();
    reportTransition({ from: '/', to: '/blog', ms: 2149.6, frames: 142, maxFrame: 33.4, long: 0 });
    expect(lastBody()).toMatchObject({
      metric: 'TX',
      value: 33,
      rating: 'good',
      target: '/ → /blog',
      detail: '142/0/2150',
      navType: 'spa',
    });
    reportTransition({ from: '/blog', to: '/about', ms: 2000, frames: 100, maxFrame: 80, long: 2 });
    expect(lastBody()).toMatchObject({ rating: 'needs-improvement' });
    reportTransition({ from: '/about', to: '/', ms: 2000, frames: 100, maxFrame: 101, long: 3 });
    expect(lastBody()).toMatchObject({ rating: 'poor' });
  });

  it('開場比上報早結束也照送：BOOT 是退場的時間，細節是 ring／collapse', async () => {
    const init = await load();
    const { reportBoot } = await import('@/store/pageTransition');
    reportBoot({ at: 1360.2, end: 'ring' });
    init();
    expect(lastBody()).toMatchObject({ metric: 'BOOT', value: 1360, rating: 'good', detail: 'ring' });
  });

  it('有沒有硬體 GPU：探測完才帶，還沒探測完不帶這個欄位', async () => {
    const init = await load();
    init();
    gpu = null;
    cbs.fcp?.(metric({ name: 'FCP' }));
    expect(lastBody()).not.toHaveProperty('gpu');
    gpu = true;
    cbs.fcp?.(metric({ name: 'FCP' }));
    expect(lastBody()).toMatchObject({ gpu: 'hw' });
    gpu = false;
    cbs.fcp?.(metric({ name: 'FCP' }));
    expect(lastBody()).toMatchObject({ gpu: 'none' });
    gpu = null;
  });
});

describe('送不出去時的退路', () => {
  // sendBeacon 在佇列滿或 payload 過大時回 false —— 那不是例外、不會 throw，
  // 沒有這條退路就是靜靜地少一筆資料。
  it('sendBeacon 回 false 時改用 fetch，而且要帶 keepalive', async () => {
    beaconOk = false;
    const init = await load();
    init();
    cbs.lcp?.(metric());

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('/api/vitals');
    expect(fetchCalls[0].init.method).toBe('POST');
    // keepalive：頁面正在卸載時沒有它請求會被取消，而 LCP/CLS 正是在 pagehide 才定稿
    expect(fetchCalls[0].init.keepalive).toBe(true);
    expect((fetchCalls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(fetchCalls[0].init.body as string)).toMatchObject({ metric: 'LCP' });
  });

  it('sendBeacon 成功時不會再打一次 fetch', async () => {
    beaconOk = true;
    const init = await load();
    init();
    cbs.lcp?.(metric());
    expect(beacons).toHaveLength(1);
    expect(fetchCalls).toHaveLength(0);
  });
});
