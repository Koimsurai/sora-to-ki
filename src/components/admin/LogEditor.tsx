import { useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import type { LogContent } from '@koimsurai/api-types';

import { logContentQueryOptions, normalizeLog } from '@/data/pageContent';
import { useAdminT } from '@/i18n/admin-i18n';
import { AdminDateField, AdminSelect } from './AdminFields';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 航行日誌：軌跡與任務計時器的起點、軌跡上的里程碑。
// 貢獻圖、今天寫了多久程式、最近在玩什麼是整合抓的（站台設定的 GitHub、WakaTime、Steam），不在這裡。

const LEVELS = ['0', '1', '2'] as const;

/** 這台瀏覽器的時區，寫成 +08:00 這種樣子：起點存的是「那一天的零點」帶時區 */
function localOffset(): string {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const abs = Math.abs(m);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export default function LogEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = useState<string>(defaultLocale);
  const page = usePageDraft(
    logContentQueryOptions,
    '/api/admin/pages/log',
    (raw) => normalizeLog(raw as LogContent),
    t('pageLog.saved'),
  );
  const { draft, set } = page;
  if (page.isPending || !draft) return <AdminLoading />;

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} content={page.draft} />

      <SectionHead id="pg-log-start">{t('pageLog.startHead')}</SectionHead>
      <p className="adm-meta">{t('pageLog.startHint')}</p>
      <div className="pg-row">
        <div className="adm-field">
          <span className="adm-caps">{t('pageLog.date')}</span>
          <AdminDateField
            label={t('pageLog.startDate')}
            value={draft.start.slice(0, 10)}
            onChange={(date) => set({ start: date ? `${date}T00:00:00${localOffset()}` : '' })}
          />
        </div>
      </div>

      <SectionHead id="pg-log-milestones">{t('pageLog.milestonesHead')}</SectionHead>
      {draft.milestones.map((m, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row pg-row-chapter">
          <div className="adm-field pg-year">
            <span className="adm-caps">{t('pageLog.date')}</span>
            <AdminDateField
              label={t('pageLog.milestoneDate', { n: i + 1 })}
              value={m.date}
              onChange={(date) => set({ milestones: replaceAt(draft.milestones, i, { date }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">{t('pageLog.what')}</span>
            <I18nInput
              lang={lang}
              label={t('pageLog.milestone')}
              value={m.text}
              onChange={(text) => set({ milestones: replaceAt(draft.milestones, i, { text }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">{t('pageLog.size')}</span>
            <AdminSelect
              label={t('pageLog.milestoneSize', { n: i + 1 })}
              value={String(m.level ?? 0)}
              options={LEVELS.map((value) => ({ value, label: t(`pageLog.level.${value}`) }))}
              onChange={(v) => set({ milestones: replaceAt(draft.milestones, i, { level: Number(v) }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.milestones.length}
            name={t('pageLog.milestoneN', { n: i + 1 })}
            onMove={(by) => set({ milestones: move(draft.milestones, i, by) })}
            onRemove={() => set({ milestones: draft.milestones.filter((_, k) => k !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ milestones: [...draft.milestones, { date: '', level: 0, text: {} }] })}
      >
        {t('pageLog.add')}
      </button>

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
