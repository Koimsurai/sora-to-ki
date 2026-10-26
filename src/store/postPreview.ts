// 後台編輯器 → 前台預覽分頁（/preview/post）的交接。
//
// 編輯器把正在編的內容（還沒存的也算）寫進 localStorage，再用 BroadcastChannel 通知；
// 預覽分頁一打開就讀 localStorage，之後跟著通知即時更新。兩邊同源才收得到，內容不經過伺服器
// （MDX 編譯除外，那本來就是預覽要做的事）。一次只有一份：站上只有一位作者。
import type { ExcerptLink } from '@koimsurai/api-types';

/** 一個語系的標題、內文、摘要 */
export interface PreviewText {
  title: string;
  content: string;
  excerpt: string;
}

export interface PostPreviewSnapshot {
  /** 已經存過的文章才有 */
  id: number | null;
  slug: string | null;
  format: string;
  category: string | null;
  tags: string[];
  series_name: string | null;
  series_order: number | null;
  layout_type: string;
  allow_comments: boolean;
  status: string;
  source_language: string;
  created_at: string | null;
  updated_at: string | null;
  view_count: number;
  author: string | null;
  /** 語系 → 那個語系的字（不一定每個語系都有） */
  texts: Partial<Record<string, PreviewText>>;
  /** 語系 → 摘要裡連到章節的句子 */
  excerpt_links: Partial<Record<string, ExcerptLink[]>>;
}

const STORAGE_KEY = 'koimsurai:post-preview';
const CHANNEL = 'koimsurai-post-preview';

let channel: BroadcastChannel | null = null;
const channelOf = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
};

export function publishPostPreview(snapshot: PostPreviewSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* 空間滿了：預覽分頁照樣收得到下面的通知，只是重整後讀不到最新的 */
  }
  channelOf()?.postMessage(snapshot);
}

export function readPostPreview(): PostPreviewSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PostPreviewSnapshot) : null;
  } catch {
    return null;
  }
}

/** 編輯器那邊一改就通知；回傳退訂 */
export function subscribePostPreview(onChange: (snapshot: PostPreviewSnapshot) => void): () => void {
  const ch = channelOf();
  const onMessage = (e: MessageEvent<PostPreviewSnapshot>) => onChange(e.data);
  ch?.addEventListener('message', onMessage);
  return () => ch?.removeEventListener('message', onMessage);
}
