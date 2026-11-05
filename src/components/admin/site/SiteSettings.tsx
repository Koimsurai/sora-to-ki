import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SiteConfig } from '@koimsurai/api-types';

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
import { siteConfigQueryOptions } from '@/data/siteConfig';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import { setLocaleConfig } from '@/lib/locales';
import AdminLoading from '../AdminLoading';
import { PageHead, SectionHead } from '../AdminPage';
import { SaveBar } from '../pageEditorKit';
import UnsavedGuard from '../UnsavedGuard';
import DescriptionFields from './DescriptionFields';
import BackupSection from './BackupSection';
import NotifySettings from './NotifySettings';
import { notifyQueryOptions, saveNotify, type NotifyDraft } from './notifyApi';
import OrbitPreview from './OrbitPreview';
import SignatureField from './SignatureField';
import { IdentityFields, LocaleFields, PageToggles, ThemeFields } from './SiteFields';
import { draftOf, siteProblems, type Draft } from './siteDraft';
import './SiteSettings.css';

// 站台設定（/admin/site）：身分、天體、語系、頁面開關四段，欄位跟初次設定的精靈是同一組（SiteFields）。
// 整頁一個儲存列：站台設定（PUT /api/admin/site/config 收整份）與通知（另一支 API，見 NotifySettings）
// 改了哪個就送哪個。備份是按下就執行的動作，不經過儲存。換預設語系會讓全站網址整批改掉，存之前再問一次。

export default function SiteSettings() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data: config, isPending } = useQuery(siteConfigQueryOptions);
  const notify = useQuery(notifyQueryOptions);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [notifyEdited, setNotifyEdited] = useState<NotifyDraft | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hot, setHot] = useState<string | null>(null);

  if (isPending || !config) return <AdminLoading page />;
  const base = draftOf(config);
  const draft = edited ?? base;
  const siteDirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(base);
  const notifyDraft = notifyEdited ?? notify.data?.settings ?? null;
  /** 通知有改、而且跟存著的不一樣時才是那份草稿，否則 null */
  const notifyPending =
    notifyEdited !== null && JSON.stringify(notifyEdited) !== JSON.stringify(notify.data?.settings)
      ? notifyEdited
      : null;
  const dirty = siteDirty || notifyPending !== null;
  const patch = (p: Partial<Draft>) => setEdited({ ...draft, ...p });
  const patchNotify = (p: Partial<NotifyDraft>) => {
    if (notifyDraft) setNotifyEdited({ ...notifyDraft, ...p });
  };
  const host = config.url.replace(/^https?:\/\//, '');

  const saveSite = async (): Promise<boolean> => {
    const res = await fetch('/api/admin/site/config', {
      method: 'PUT',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(draft),
    });
    const body = (await res.json().catch(() => ({}))) as SiteConfig & { error?: string };
    if (!res.ok) {
      toast.error(apiErrorText(body, at, 'errors', t('common.saveFailed', { status: res.status })));
      return false;
    }
    queryClient.setQueryData(siteConfigQueryOptions.queryKey, body);
    // 語系列（後台編輯器的語系分頁、譯名欄）讀的是這一份，存好就跟上
    setLocaleConfig(body.default_locale, body.locales);
    setEdited(null);
    setTouched(false);
    return true;
  };

  const save = async () => {
    setSaving(true);
    try {
      // 兩支各自成敗：站台存好、通知失敗時，站台那份已經是新的，只留通知的修改給站長再按一次
      const siteOk = siteDirty ? await saveSite() : true;
      let notifyOk = true;
      if (notifyPending) {
        try {
          queryClient.setQueryData(notifyQueryOptions.queryKey, await saveNotify(notifyPending));
          setNotifyEdited(null);
        } catch (e) {
          notifyOk = false;
          toast.error(e instanceof Error ? e.message : t('common.offline'));
        }
      }
      if (siteOk && notifyOk) toast.success(t('site.settings.saved'));
    } catch {
      toast.error(t('common.offline'));
    } finally {
      setSaving(false);
    }
  };

  const trySave = () => {
    setTouched(true);
    if (siteProblems(draft).length > 0) {
      toast.error(t('site.settings.invalid'));
      return;
    }
    if (siteDirty && draft.default_locale !== config.default_locale) setConfirming(true);
    else void save();
  };

  const langName = (l: string) => t(`layout.languageName.${l}`);

  return (
    <div className="adm-page adm-page-narrow sfs">
      <PageHead title={t('site.settings.title')} latin={t('site.settings.latin')} meta={t('site.settings.meta')} />

      <section className="adm-stack" aria-labelledby="sfs-identity">
        <SectionHead id="sfs-identity">{t('site.settings.identityHead')}</SectionHead>
        <IdentityFields draft={draft} patch={patch} url={config.url} touched={touched} />
        <SignatureField draft={draft} patch={patch} />
      </section>

      <section className="adm-stack" aria-labelledby="sfs-theme">
        <SectionHead id="sfs-theme">{t('site.settings.themeHead')}</SectionHead>
        <ThemeFields draft={draft} patch={patch} />
      </section>

      <section className="adm-stack" aria-labelledby="sfs-locales">
        <SectionHead id="sfs-locales">{t('site.settings.localesHead')}</SectionHead>
        <LocaleFields draft={draft} patch={patch} />
      </section>

      <section className="adm-stack" aria-labelledby="sfs-pages">
        <SectionHead id="sfs-pages">{t('site.settings.pagesHead')}</SectionHead>
        <p className="adm-form-note">{t('site.settings.pagesNote')}</p>
        {/* 上面一條是改完的首頁（軌道與兩個選單），下面三組開關並排，滑過哪一列上面就亮哪一條 */}
        <div className="sfs-sky">
          <OrbitPreview step="pages" draft={draft} hot={hot} owner={null} url={config.url} compact />
        </div>
        <div className="sfs-pages">
          <PageToggles draft={draft} patch={patch} hot={hot} onHot={setHot} notes />
        </div>
      </section>

      <section className="adm-stack" aria-labelledby="sfs-descriptions">
        <SectionHead id="sfs-descriptions">{t('site.settings.descriptionsHead')}</SectionHead>
        <p className="adm-form-note">{t('site.settings.descriptionsNote')}</p>
        <DescriptionFields
          draft={draft}
          patch={patch}
          locales={[config.default_locale, ...config.locales.filter((l) => l !== config.default_locale)]}
          disabled={draft.disabled_pages}
        />
      </section>

      <section className="adm-stack" aria-labelledby="sfs-notify">
        <SectionHead id="sfs-notify">{t('site.settings.notifyHead')}</SectionHead>
        <p className="adm-form-note">{t('site.settings.notifyNote')}</p>
        {notify.isError ? (
          <p className="sf-hint">{t('site.notify.loadFailed')}</p>
        ) : notify.data && notifyDraft ? (
          <NotifySettings data={notify.data} draft={notifyDraft} patch={patchNotify} />
        ) : null}
      </section>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onReset={() => {
          setEdited(null);
          setNotifyEdited(null);
        }}
        onSave={trySave}
      />

      {/* 備份放在儲存列之後、另起一塊：這裡的按鈕按下就執行，跟上面的儲存無關 */}
      <section className="adm-stack sfs-actions" aria-labelledby="sfs-backup">
        <SectionHead id="sfs-backup">{t('site.backup.head')}</SectionHead>
        <p className="adm-form-note">{t('site.backup.immediate')}</p>
        <BackupSection />
      </section>
      <UnsavedGuard dirty={dirty} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('site.settings.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('site.settings.confirmDesc', {
                from: langName(config.default_locale),
                to: langName(draft.default_locale),
                host,
                fromPrefix: config.default_locale.toLowerCase(),
                toPrefix: draft.default_locale.toLowerCase(),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('site.settings.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>{t('site.settings.confirmOk')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
