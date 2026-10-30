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
import { useAdminT } from '@/i18n/admin-i18n';
import { jsonAuthHeaders } from '@/lib/authToken';
import { setLocaleConfig } from '@/lib/locales';
import AdminLoading from '../AdminLoading';
import { PageHead, SectionHead } from '../AdminPage';
import { SaveBar } from '../pageEditorKit';
import UnsavedGuard from '../UnsavedGuard';
import DescriptionFields from './DescriptionFields';
import OrbitPreview from './OrbitPreview';
import { IdentityFields, LocaleFields, PageToggles, ThemeFields } from './SiteFields';
import { draftOf, siteProblems, type Draft } from './siteDraft';
import './SiteSettings.css';

// 站台設定（/admin/site）：身分、天體、語系、頁面開關四段，欄位跟初次設定的精靈是同一組（SiteFields）。
// 四段一起存（PUT /api/admin/site/config 收整份）。換預設語系會讓全站網址整批改掉，存之前再問一次。

export default function SiteSettings() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data: config, isPending } = useQuery(siteConfigQueryOptions);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hot, setHot] = useState<string | null>(null);

  if (isPending || !config) return <AdminLoading page />;
  const base = draftOf(config);
  const draft = edited ?? base;
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(base);
  const patch = (p: Partial<Draft>) => setEdited({ ...draft, ...p });
  const host = config.url.replace(/^https?:\/\//, '');

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/site/config', {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => ({}))) as SiteConfig & { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? t('common.saveFailed', { status: res.status }));
        return;
      }
      queryClient.setQueryData(siteConfigQueryOptions.queryKey, body);
      // 語系列（後台編輯器的語系分頁、譯名欄）讀的是這一份，存好就跟上
      setLocaleConfig(body.default_locale, body.locales);
      setEdited(null);
      setTouched(false);
      toast.success(t('site.settings.saved'));
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
    if (draft.default_locale !== config.default_locale) setConfirming(true);
    else void save();
  };

  const langName = (l: string) => t(`layout.languageName.${l}`);

  return (
    <div className="adm-page adm-page-narrow sfs">
      <PageHead title={t('site.settings.title')} latin={t('site.settings.latin')} meta={t('site.settings.meta')} />

      <section className="adm-stack" aria-labelledby="sfs-identity">
        <SectionHead id="sfs-identity">{t('site.settings.identityHead')}</SectionHead>
        <IdentityFields draft={draft} patch={patch} url={config.url} touched={touched} />
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

      <SaveBar dirty={dirty} saving={saving} onReset={() => setEdited(null)} onSave={trySave} />
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
