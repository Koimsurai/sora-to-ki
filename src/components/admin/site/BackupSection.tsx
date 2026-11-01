import { useState } from 'react';

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
import { authHeaders } from '@/lib/authToken';
import { uploadBackup, waitForRestart } from './backupApi';

// 備份與搬家（後端 handlers/backup.rs）：下載現在的資料庫、上傳一份蓋回去。
// 上傳之後後端會自己重開、在開機時換上去，這裡等它回來再重新整理。
// 上傳的圖片與照片不在資料庫裡，畫面上講清楚要另外搬資料夾。

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'restarting' } | { kind: 'error'; text: string };

/**
 * 初次設定的精靈：搬家到新主機時，用設定碼直接把舊站的備份換上去，不必先認領。
 * 換好之後舊站的站長就是這裡的站長，帶去後台登入
 */
export function WizardRestore({ code }: { code: string }) {
  const { t } = useAdminT();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const restore = async (f: File) => {
    setStatus({ kind: 'busy' });
    const error = await uploadBackup('/api/init/restore', f, { 'x-setup-code': code.trim() });
    if (error) {
      setStatus({ kind: 'error', text: error });
      return;
    }
    setStatus({ kind: 'restarting' });
    await waitForRestart();
    window.location.href = '/admin';
  };

  return (
    <details className="wz-restore">
      <summary>{t('init.gate.restoreSummary')}</summary>
      <p className="wz-hint">{t('init.gate.restoreNote')}</p>
      <label className="wz-btn" aria-disabled={!code.trim() || status.kind !== 'idle'}>
        {status.kind === 'busy'
          ? t('init.gate.restoreUploading')
          : status.kind === 'restarting'
            ? t('init.gate.restoreRestarting')
            : t('init.gate.restorePick')}
        <input
          type="file"
          accept=".gz,.sqlite,.db,application/gzip,application/x-sqlite3"
          hidden
          disabled={!code.trim() || status.kind === 'busy' || status.kind === 'restarting'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void restore(f);
          }}
        />
      </label>
      {status.kind === 'error' && (
        <span className="sf-error" role="alert">
          {status.text}
        </span>
      )}
    </details>
  );
}

/** 站台設定頁最下面那段：下載、還原 */
export default function BackupSection() {
  const { t } = useAdminT();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [file, setFile] = useState<File | null>(null);

  const download = async () => {
    setStatus({ kind: 'busy' });
    try {
      const res = await fetch('/api/admin/backup', { headers: authHeaders() });
      if (!res.ok) {
        setStatus({ kind: 'error', text: t('site.backup.downloadFailed', { status: res.status }) });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'backup.sqlite.gz';
      const href = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href, download: name });
      a.click();
      URL.revokeObjectURL(href);
      setStatus({ kind: 'idle' });
    } catch {
      setStatus({ kind: 'error', text: t('common.offline') });
    }
  };

  const restore = async (f: File) => {
    setFile(null);
    setStatus({ kind: 'busy' });
    const error = await uploadBackup('/api/admin/backup/restore', f, authHeaders());
    if (error) {
      setStatus({ kind: 'error', text: error });
      return;
    }
    setStatus({ kind: 'restarting' });
    await waitForRestart();
    window.location.reload();
  };

  const busy = status.kind === 'busy' || status.kind === 'restarting';
  return (
    <>
      <p className="adm-form-note">{t('site.backup.note')}</p>
      <div className="sf-backup-actions">
        <button type="button" className="adm-btn adm-btn-small" disabled={busy} onClick={() => void download()}>
          {t('site.backup.download')}
        </button>
        <label className="adm-btn adm-btn-small" aria-disabled={busy}>
          {t('site.backup.restore')}
          <input
            type="file"
            accept=".gz,.sqlite,.db,application/gzip,application/x-sqlite3"
            hidden
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {status.kind === 'restarting' && <p className="sf-hint">{t('site.backup.restarting')}</p>}
      {status.kind === 'error' && (
        <span className="sf-error" role="alert">
          {status.text}
        </span>
      )}
      <AlertDialog open={file !== null} onOpenChange={(open) => !open && setFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('site.backup.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('site.backup.confirmBody', { name: file?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('site.backup.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => file && void restore(file)}>{t('site.backup.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
