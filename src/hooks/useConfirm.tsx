import { useCallback, useRef, useState, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** 確定那顆的字（預設「確定」） */
  confirmLabel?: string;
  /** 取消那顆的字（預設「先不要」） */
  cancelLabel?: string;
  /** 會刪東西、蓋掉東西、寄出去收不回來的，確定那顆用朱色 */
  danger?: boolean;
}

/**
 * `window.confirm()` 的替身：問一句、等使用者按，回傳按了哪顆。
 * 原生的 confirm 是瀏覽器畫的（白底、系統字、標題是網址），而且會卡住整個頁面。
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: '要覆蓋嗎？' }))) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 */
export function useConfirm(): { confirm: (o: ConfirmOptions) => Promise<boolean>; confirmDialog: ReactNode } {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // 上一個還沒回答就又問：當成取消，不讓它永遠等下去
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOpts(o);
      }),
    [],
  );

  const answer = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpts(null);
  };

  const confirmDialog = (
    <AlertDialog
      open={opts !== null}
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer(false)}>{opts?.cancelLabel ?? '先不要'}</AlertDialogCancel>
          <AlertDialogAction variant={opts?.danger ? 'destructive' : 'default'} onClick={() => answer(true)}>
            {opts?.confirmLabel ?? '確定'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
