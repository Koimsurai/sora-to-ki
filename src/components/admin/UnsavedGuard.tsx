import { useBlocker } from '@tanstack/react-router';

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
import { useAdminT } from '@/i18n/admin-i18n';

// 改了還沒存就要離開這一頁時先問一次：換到後台別頁、按上一頁、關分頁或重新整理。
// 只看路徑：同一頁裡換 ?tab= 不算離開（「頁面」的草稿留在 PagesManager，切回來還在）。

export default function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const { t } = useAdminT();
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    // 關分頁、重新整理只能交給瀏覽器自己的那個對話框
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  return (
    <AlertDialog open={blocker.status === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.unsaved.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('common.unsaved.desc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>{t('common.unsaved.stay')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
            {t('common.unsaved.leave')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
