import { createFileRoute } from '@tanstack/react-router';

// ISR demo：loader 在 server 端 render 時執行，打絕對後端(繞開組件相對 /api 的 self-fetch 坑)。
// renderedAt 每次真 render 都不同 → 配 routeRules swr 後：TTL 內回快取(同時間戳)、過期背景重生(新時間戳)。
export const Route = createFileRoute('/isr-demo')({
  loader: async () => {
    const base = (typeof process !== 'undefined' && process.env.BACKEND_URL) || 'http://127.0.0.1:3002';
    let tagCount = -1;
    try {
      const res = await fetch(`${base}/api/tags`);
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data) ? data : ((data as { tags?: unknown[] })?.tags ?? []);
      tagCount = list.length;
    } catch { /* ignore */ }
    return { tagCount, renderedAt: new Date().toISOString() };
  },
  component: () => {
    const { tagCount, renderedAt } = Route.useLoaderData();
    return (
      <div style={{ padding: 40, fontFamily: 'monospace' }}>
        <h1>ISR demo</h1>
        <p>tags from backend: {tagCount}</p>
        <p>server-rendered at: <b data-testid="rendered-at">{renderedAt}</b></p>
        <p>（TTL 內重整=同時間戳=快取命中；過 TTL=背景重生換新時間戳）</p>
      </div>
    );
  },
});
