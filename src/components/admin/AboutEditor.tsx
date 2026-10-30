import { useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import type { AboutContent } from '@koimsurai/api-types';

import { aboutContentQueryOptions, normalizeAbout } from '@/data/pageContent';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 關於頁：往下掉經過的每一年、地表的技能、第一層的經歷、地心那一句。
// 會翻譯的欄位跟著上面的語系切換；年份、期間、技能名、引言不分語系。
// 其他語系留空，前台就顯示繁中——所以只有繁中那一欄是「一定要填」的。

/** 技能那一欄：用逗號、頓號或換行隔開 */
const splitItems = (s: string) =>
  s
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function AboutEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = useState<string>(defaultLocale);
  const page = usePageDraft(
    aboutContentQueryOptions,
    '/api/admin/pages/about',
    (raw) => normalizeAbout(raw as AboutContent),
    t('pageAbout.saved'),
  );
  const { draft, set } = page;
  if (page.isPending || !draft) return <AdminLoading />;

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} content={page.draft} />

      <SectionHead id="pg-about-chapters">{t('pageAbout.chaptersHead')}</SectionHead>
      <p className="adm-meta">{t('pageAbout.chaptersHint')}</p>
      {draft.chapters.map((c, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row pg-row-chapter">
          <label className="adm-field pg-year">
            <span className="adm-caps">{t('pageAbout.year')}</span>
            <input
              value={c.year}
              onChange={(e) => set({ chapters: replaceAt(draft.chapters, i, { year: e.target.value }) })}
              placeholder="2004"
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageAbout.title')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.title')}
              value={c.title}
              onChange={(title) => set({ chapters: replaceAt(draft.chapters, i, { title }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">{t('pageAbout.subtitle')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.subtitle')}
              value={c.subtitle}
              onChange={(subtitle) => set({ chapters: replaceAt(draft.chapters, i, { subtitle }) })}
            />
          </div>
          <div className="adm-field pg-wide">
            <span className="adm-caps">{t('pageAbout.line')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.line')}
              multiline
              value={c.line}
              onChange={(line) => set({ chapters: replaceAt(draft.chapters, i, { line }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.chapters.length}
            name={t('pageAbout.chapterN', { n: i + 1 })}
            onMove={(by) => set({ chapters: move(draft.chapters, i, by) })}
            onRemove={() => set({ chapters: draft.chapters.filter((_, k) => k !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ chapters: [...draft.chapters, { year: '', title: {}, subtitle: {}, line: {} }] })}
      >
        {t('pageAbout.addYear')}
      </button>

      <SectionHead id="pg-about-skills">{t('pageAbout.skillsHead')}</SectionHead>
      {draft.skills.map((g, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <div className="adm-field">
            <span className="adm-caps">{t('pageAbout.group')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.group')}
              value={g.label}
              onChange={(label) => set({ skills: replaceAt(draft.skills, i, { label }) })}
            />
          </div>
          <label className="adm-field pg-wide">
            <span className="adm-caps">{t('pageAbout.items')}</span>
            <input
              defaultValue={g.items.join(', ')}
              onBlur={(e) => set({ skills: replaceAt(draft.skills, i, { items: splitItems(e.target.value) }) })}
              placeholder="React, TypeScript, Rust"
            />
          </label>
          <RowActions
            index={i}
            length={draft.skills.length}
            name={t('pageAbout.groupN', { n: i + 1 })}
            onMove={(by) => set({ skills: move(draft.skills, i, by) })}
            onRemove={() => set({ skills: draft.skills.filter((_, k) => k !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ skills: [...draft.skills, { label: {}, items: [] }] })}
      >
        {t('pageAbout.addGroup')}
      </button>

      <SectionHead id="pg-about-jobs">{t('pageAbout.jobsHead')}</SectionHead>
      {draft.jobs.map((j, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <label className="adm-field pg-year">
            <span className="adm-caps">{t('pageAbout.period')}</span>
            <input
              value={j.period}
              onChange={(e) => set({ jobs: replaceAt(draft.jobs, i, { period: e.target.value }) })}
              placeholder="2025/7 — Now"
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageAbout.org')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.org')}
              value={j.title}
              onChange={(title) => set({ jobs: replaceAt(draft.jobs, i, { title }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">{t('pageAbout.role')}</span>
            <I18nInput
              lang={lang}
              label={t('pageAbout.role')}
              value={j.role}
              onChange={(role) => set({ jobs: replaceAt(draft.jobs, i, { role }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.jobs.length}
            name={t('pageAbout.jobN', { n: i + 1 })}
            onMove={(by) => set({ jobs: move(draft.jobs, i, by) })}
            onRemove={() => set({ jobs: draft.jobs.filter((_, k) => k !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ jobs: [...draft.jobs, { period: '', title: {}, role: {} }] })}
      >
        {t('pageAbout.addJob')}
      </button>

      <SectionHead id="pg-about-quote">{t('pageAbout.quoteHead')}</SectionHead>
      <div className="pg-row">
        <label className="adm-field pg-wide">
          <span className="adm-caps">{t('pageAbout.quote')}</span>
          <textarea
            rows={2}
            value={draft.quote?.text ?? ''}
            onChange={(e) => set({ quote: { text: e.target.value, cite: draft.quote?.cite ?? '' } })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-caps">{t('pageAbout.cite')}</span>
          <input
            value={draft.quote?.cite ?? ''}
            onChange={(e) => set({ quote: { text: draft.quote?.text ?? '', cite: e.target.value } })}
          />
        </label>
      </div>

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
