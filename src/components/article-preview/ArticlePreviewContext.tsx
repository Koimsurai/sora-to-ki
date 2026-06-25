import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

/**
 * Article Preview 全域狀態管理
 *
 * 互動模型（v2，避免 flicker bug）：
 *   - hover sidebar 文章 200ms → preview 開
 *   - 一旦開啟，**不會因 mouse leave anchor 自動關**（避免從 sidebar 移到 centered modal 路上被誤關）
 *   - 關閉條件：
 *       a) Esc 鍵
 *       b) 點 backdrop（document-level click listener，排除卡片內部）
 *       c) 點原本 sidebar link → 正常 navigate（usePreviewLink 的 onClick 觸發 reset）
 *       d) 點「進入文章 →」按鈕 → commit transition（不再有 scroll 到 60% auto-commit）
 *       e) hover 不同 sidebar link → 換成預覽那篇（替換 previewId）
 *   - 行動裝置（無 hover）→ isHoverCapable=false，跳過 preview 整套邏輯
 */

type PreviewState = 'idle' | 'peeking' | 'committing' | 'committed';

interface ArticlePreviewValue {
  state: PreviewState;
  previewId: string | null;
  isHoverCapable: boolean;
  requestPreview: (id: string) => void;
  cancelPendingHover: () => void;
  scheduleClose: (delay?: number) => void;
  cancelClose: () => void;
  dismissPreview: () => void;
  reportScrollProgress: (progress: number) => void;
  commit: () => void;
  markCommitted: () => void;
  reset: () => void;
}

const ArticlePreviewContext = createContext<ArticlePreviewValue | null>(null);

const HOVER_DELAY_MS = 200;
const LEAVE_GRACE_MS = 400; // 移出 anchor / card 後，多久收回 preview

export function ArticlePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState>('idle');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollProgressRef = useRef(0);

  const isHoverCapable = typeof window !== 'undefined'
    && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

  const cancelPendingHover = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // 預約關閉 preview（grace period，給使用者從 anchor 移到 card 中間的空檔）
  // 一致行為：不管有沒有滾動，移出後固定 400ms 收回（使用者選 B 方案）
  const scheduleClose = useCallback((delay = LEAVE_GRACE_MS) => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      cancelPendingHover();
      scrollProgressRef.current = 0;
      setState('idle');
      setPreviewId(null);
    }, delay);
  }, [cancelClose, cancelPendingHover]);

  // 觸發 preview hover（延遲 200ms，避免滑過誤觸）
  const requestPreview = useCallback((id: string) => {
    if (!isHoverCapable || !id) return;
    cancelPendingHover();
    cancelClose(); // 同時取消上一個 anchor 的 close timer
    hoverTimerRef.current = setTimeout(() => {
      scrollProgressRef.current = 0;
      setPreviewId(id);
      setState('peeking');
    }, HOVER_DELAY_MS);
  }, [isHoverCapable, cancelPendingHover, cancelClose]);

  // 強制關閉 preview（Esc / 點外部 / 點 link 用）
  const dismissPreview = useCallback(() => {
    cancelPendingHover();
    cancelClose();
    scrollProgressRef.current = 0;
    setState('idle');
    setPreviewId(null);
  }, [cancelPendingHover, cancelClose]);

  // 報告 scroll 進度 — 純紀錄，不再自動觸發 commit
  // （早期 scroll 到 60% auto-commit，現在 commit 只透過「進入文章 →」按鈕）
  const reportScrollProgress = useCallback((progress: number) => {
    scrollProgressRef.current = progress;
  }, []);

  // 點「進入文章」立即 commit
  const commit = useCallback(() => {
    setState((s) => (s === 'peeking' ? 'committing' : s));
  }, []);

  const markCommitted = useCallback(() => { setState('committed'); }, []);

  const reset = useCallback(() => {
    cancelPendingHover();
    cancelClose();
    scrollProgressRef.current = 0;
    setState('idle');
    setPreviewId(null);
  }, [cancelPendingHover, cancelClose]);

  // Esc → 關
  useEffect(() => {
    if (state === 'idle') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissPreview(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [state, dismissPreview]);

  useEffect(() => () => {
    cancelPendingHover();
    cancelClose();
  }, [cancelPendingHover, cancelClose]);

  const value: ArticlePreviewValue = {
    state,
    previewId,
    isHoverCapable,
    requestPreview,
    cancelPendingHover,
    scheduleClose,
    cancelClose,
    dismissPreview,
    reportScrollProgress,
    commit,
    markCommitted,
    reset,
  };

  return (
    <ArticlePreviewContext.Provider value={value}>
      {children}
    </ArticlePreviewContext.Provider>
  );
}

export function useArticlePreview(): ArticlePreviewValue {
  const ctx = useContext(ArticlePreviewContext);
  if (!ctx) {
    const noop = () => { /* default no-op when used outside provider */ };
    return {
      state: 'idle',
      previewId: null,
      isHoverCapable: false,
      requestPreview: noop,
      cancelPendingHover: noop,
      scheduleClose: noop,
      cancelClose: noop,
      dismissPreview: noop,
      reportScrollProgress: noop,
      commit: noop,
      markCommitted: noop,
      reset: noop,
    };
  }
  return ctx;
}
