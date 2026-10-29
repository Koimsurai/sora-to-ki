import { useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import type { AboutContent } from '@koimsurai/api-types';

import { aboutContentQueryOptions, normalizeAbout } from '@/data/pageContent';
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
  const [lang, setLang] = useState<string>(defaultLocale);
  const page = usePageDraft(
    aboutContentQueryOptions,
    '/api/admin/pages/about',
    (raw) => normalizeAbout(raw as AboutContent),
    '關於頁已更新',
  );
  const { draft, set } = page;
  if (page.isPending || !draft) return <AdminLoading />;

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} />

      <SectionHead id="pg-about-chapters">每一年 · 往下掉經過的</SectionHead>
      <p className="adm-meta">一年一句話。年份寫 NOW 會顯示成「現在」，那一章的標題也會出現在落地處。</p>
      {draft.chapters.map((c, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row pg-row-chapter">
          <label className="adm-field pg-year">
            <span className="adm-caps">年份</span>
            <input
              value={c.year}
              onChange={(e) => set({ chapters: replaceAt(draft.chapters, i, { year: e.target.value }) })}
              placeholder="2004"
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">標題</span>
            <I18nInput
              lang={lang}
              label="標題"
              value={c.title}
              onChange={(title) => set({ chapters: replaceAt(draft.chapters, i, { title }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">副標</span>
            <I18nInput
              lang={lang}
              label="副標"
              value={c.subtitle}
              onChange={(subtitle) => set({ chapters: replaceAt(draft.chapters, i, { subtitle }) })}
            />
          </div>
          <div className="adm-field pg-wide">
            <span className="adm-caps">那一句</span>
            <I18nInput
              lang={lang}
              label="那一句"
              multiline
              value={c.line}
              onChange={(line) => set({ chapters: replaceAt(draft.chapters, i, { line }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.chapters.length}
            name={`第 ${i + 1} 章`}
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
        ＋ 加一年
      </button>

      <SectionHead id="pg-about-skills">地表 · 手上的東西</SectionHead>
      {draft.skills.map((g, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <div className="adm-field">
            <span className="adm-caps">分組</span>
            <I18nInput
              lang={lang}
              label="分組"
              value={g.label}
              onChange={(label) => set({ skills: replaceAt(draft.skills, i, { label }) })}
            />
          </div>
          <label className="adm-field pg-wide">
            <span className="adm-caps">項目 · 逗號隔開，不分語系</span>
            <input
              defaultValue={g.items.join(', ')}
              onBlur={(e) => set({ skills: replaceAt(draft.skills, i, { items: splitItems(e.target.value) }) })}
              placeholder="React, TypeScript, Rust"
            />
          </label>
          <RowActions
            index={i}
            length={draft.skills.length}
            name={`第 ${i + 1} 組`}
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
        ＋ 加一組
      </button>

      <SectionHead id="pg-about-jobs">第一層 · 做過的事</SectionHead>
      {draft.jobs.map((j, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <label className="adm-field pg-year">
            <span className="adm-caps">期間</span>
            <input
              value={j.period}
              onChange={(e) => set({ jobs: replaceAt(draft.jobs, i, { period: e.target.value }) })}
              placeholder="2025/7 — Now"
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">單位</span>
            <I18nInput
              lang={lang}
              label="單位"
              value={j.title}
              onChange={(title) => set({ jobs: replaceAt(draft.jobs, i, { title }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">職稱</span>
            <I18nInput
              lang={lang}
              label="職稱"
              value={j.role}
              onChange={(role) => set({ jobs: replaceAt(draft.jobs, i, { role }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.jobs.length}
            name={`第 ${i + 1} 段經歷`}
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
        ＋ 加一段
      </button>

      <SectionHead id="pg-about-quote">地心 · 最後那一句</SectionHead>
      <div className="pg-row">
        <label className="adm-field pg-wide">
          <span className="adm-caps">引言 · 換行就是畫面上的換行，留空就不顯示</span>
          <textarea
            rows={2}
            value={draft.quote?.text ?? ''}
            onChange={(e) => set({ quote: { text: e.target.value, cite: draft.quote?.cite ?? '' } })}
          />
        </label>
        <label className="adm-field">
          <span className="adm-caps">出處</span>
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
