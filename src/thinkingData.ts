import { apiUrl } from './api';
import type { Thought } from './components/ThoughtCard';

export interface ThinkingData {
  thoughts: Thought[];
}

// 碎念頁 loader：在 server 端先抓好碎念 baked 進 HTML。
// 元件原本只在 useEffect 抓 → SSR 時 thoughts 是 null（載入中）→ HTML 裡 0 則碎念。
// limit 對齊元件原本的 50。
export async function loadThinking(): Promise<ThinkingData> {
  try {
    const res = await fetch(apiUrl('/api/thoughts?limit=50'));
    if (!res.ok) return { thoughts: [] };
    const data = (await res.json()) as { thoughts?: Thought[] };
    return { thoughts: data.thoughts ?? [] };
  } catch {
    return { thoughts: [] }; // 後端不通不擋頁面：退回 client 端自己抓
  }
}
