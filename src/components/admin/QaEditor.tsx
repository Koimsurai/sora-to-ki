import { useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import type { QaContent } from '@koimsurai/api-types';

import { normalizeQa, qaContentQueryOptions } from '@/data/pageContent';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 此站點的問答：六分儀那片天空裡的「問答」星。一題都沒有時那顆星不出現。

export default function QaEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = useState<string>(defaultLocale);
  const page = usePageDraft(
    qaContentQueryOptions,
    '/api/admin/pages/qa',
    (raw) => normalizeQa(raw as QaContent),
    t('pageQa.saved'),
  );
  const qa = page.draft;
  if (page.isPending || !qa) return <AdminLoading />;
  const { items } = qa;
  const setItems = (next: typeof items) => page.set({ items: next });

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} />

      <SectionHead id="pg-qa-intro">{t('pageQa.introHead')}</SectionHead>
      <div className="adm-field">
        <I18nInput lang={lang} label={t('pageQa.intro')} value={qa.intro} onChange={(intro) => page.set({ intro })} />
      </div>

      <SectionHead id="pg-qa-items">{t('pageQa.itemsHead')}</SectionHead>
      <p className="adm-meta">{t('pageQa.itemsHint')}</p>
      {items.map((it, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <div className="adm-field pg-wide">
            <span className="adm-caps">{t('pageQa.question')}</span>
            <I18nInput
              lang={lang}
              label={t('pageQa.question')}
              value={it.q}
              onChange={(q) => setItems(replaceAt(items, i, { q }))}
            />
          </div>
          <div className="adm-field pg-wide">
            <span className="adm-caps">{t('pageQa.answer')}</span>
            <I18nInput
              lang={lang}
              label={t('pageQa.answer')}
              multiline
              value={it.a}
              onChange={(a) => setItems(replaceAt(items, i, { a }))}
            />
          </div>
          <RowActions
            index={i}
            length={items.length}
            name={t('pageQa.itemN', { n: i + 1 })}
            onMove={(by) => setItems(move(items, i, by))}
            onRemove={() => setItems(items.filter((_, k) => k !== i))}
          />
        </div>
      ))}
      <button type="button" className="adm-btn pg-add" onClick={() => setItems([...items, { q: {}, a: {} }])}>
        {t('pageQa.add')}
      </button>

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
