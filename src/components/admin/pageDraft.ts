import { createContext, use, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

import { at } from '@/i18n/admin-i18n';
import { jsonAuthHeaders } from '@/lib/authToken';
import { defaultLocale } from '@/lib/locales';

// 後台「頁面」各分頁共用的邏輯：草稿與儲存、列表的挪動。畫面零件在 pageEditorKit.tsx

export type I18n = Record<string, string>;

/**
 * 「頁面」幾個分頁共用的狀態，放在 PagesManager：切分頁時編輯器整個換掉，
 * 改到一半的草稿（以 API 路徑為鍵）與正在編的語系要留下來，切回來還在
 */
export interface PagesShared {
  drafts: Readonly<Record<string, unknown>>;
  setDraft: (url: string, draft: unknown) => void;
  lang: string;
  setLang: (lang: string) => void;
}

export const PagesContext = createContext<PagesShared | null>(null);

/** 正在編的語系：在 PagesManager 底下跟著分頁走，單獨掛的編輯器（元件測試）自己記 */
export function usePageLang(): [string, (lang: string) => void] {
  const shared = use(PagesContext);
  const [own, setOwn] = useState<string>(defaultLocale);
  return shared ? [shared.lang, shared.setLang] : [own, setOwn];
}

/** 列表裡第 i 筆往上或往下挪一格 */
export function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 列表裡換掉第 i 筆的幾個欄位 */
export function replaceAt<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((x, k) => (k === i ? { ...x, ...patch } : x));
}

/**
 * 一頁的草稿：改過才有草稿，沒改過就是伺服器上的那份；存好或按「還原」就丟掉草稿。
 * 存是整份 PUT（後端整份覆蓋），存好的那份直接寫回查詢快取，前台開著的分頁也跟上
 */
export function usePageDraft<T, K extends QueryKey>(
  options: UseQueryOptions<T, Error, T, K> & { queryKey: K },
  url: string,
  normalize: (raw: unknown) => T,
  savedMessage: string,
  /** 送出前再整理一次（例如作品頁順便更新最後量到的數字）；失敗就照原樣存 */
  prepare?: (draft: T) => Promise<T>,
) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(options);
  const shared = use(PagesContext);
  const [own, setOwn] = useState<T | null>(null);
  const edited = shared ? ((shared.drafts[url] as T | undefined) ?? null) : own;
  const setEdited = (next: T | null) => (shared ? shared.setDraft(url, next) : setOwn(next));
  const [saving, setSaving] = useState(false);
  const draft = edited ?? data;
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(data);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body0 = prepare ? await prepare(draft).catch(() => draft) : draft;
      const res = await fetch(url, { method: 'PUT', headers: jsonAuthHeaders(), body: JSON.stringify(body0) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? at('common.saveFailed', { status: res.status }));
        return;
      }
      queryClient.setQueryData<T>(options.queryKey, normalize(body));
      setEdited(null);
      toast.success(savedMessage);
    } catch {
      toast.error(at('common.offline'));
    } finally {
      setSaving(false);
    }
  };

  return {
    draft,
    isPending,
    dirty,
    saving,
    /** 改一部分：草稿從目前看到的那份開始；改回跟伺服器一樣就丟掉草稿（分頁上「還沒存」的記號跟著消失） */
    set: (patch: Partial<T>) => {
      if (!draft) return;
      const next = { ...draft, ...patch };
      setEdited(JSON.stringify(next) === JSON.stringify(data) ? null : next);
    },
    save,
    reset: () => setEdited(null),
  };
}
