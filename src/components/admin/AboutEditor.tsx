import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AboutContent } from '@koimsurai/api-types';

import { aboutContentQueryOptions, normalizeAbout, type About } from '@/data/pageContent';
import { jsonAuthHeaders } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { EDIT_LOCALES } from './pageTabs';

// 關於頁：往下掉經過的每一年、地表的技能、第一層的經歷、地心那一句。
// 會翻譯的欄位跟著上面的語系切換；年份、期間、技能名、引言不分語系。
// 其他語系留空，前台就顯示繁中——所以只有繁中那一欄是「一定要填」的。

type I18n = Record<string, string>;

/** 列表裡第 i 筆往上或往下挪一格 */
function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 技能那一欄：用逗號、頓號或換行隔開 */
const splitItems = (s: string) =>
  s
    .split(/[,，、\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function AboutEditor() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(aboutContentQueryOptions);
  // 改過才有草稿；沒改過就是伺服器上的那份（存好或按「還原」就丟掉草稿）
  const [edited, setEdited] = useState<About | null>(null);
  const [lang, setLang] = useState<string>('zh-TW');
  const [saving, setSaving] = useState(false);

  const draft = edited ?? data;
  if (isPending || !draft) return <AdminLoading />;

  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(data);
  const set = (patch: Partial<About>) => setEdited({ ...draft, ...patch });
  const isDefault = lang === 'zh-TW';

  /** 一個會翻譯的輸入框：寫進目前的語系；非預設語系的提示字是繁中原文 */
  const text = (value: I18n | undefined, onChange: (next: I18n) => void, label: string, multiline = false) => {
    const props = {
      'aria-label': `${label}（${lang}）`,
      value: value?.[lang] ?? '',
      placeholder: isDefault ? label : (value?.['zh-TW'] ?? ''),
      onChange: (e: { target: { value: string } }) => onChange({ ...value, [lang]: e.target.value }),
    };
    return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pages/about', {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => ({}))) as AboutContent & { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? `存不進去（${res.status}）`);
        return;
      }
      const saved = normalizeAbout(body);
      queryClient.setQueryData(aboutContentQueryOptions.queryKey, saved);
      setEdited(null);
      toast.success('關於頁已更新');
    } catch {
      toast.error('連不上伺服器，還沒存');
    } finally {
      setSaving(false);
    }
  };

  const rowActions = (i: number, length: number, onMove: (by: -1 | 1) => void, onRemove: () => void, name: string) => (
    <div className="adm-row-actions">
      <button
        type="button"
        className="adm-icon-btn"
        aria-label={`${name}往上`}
        disabled={i === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="adm-icon-btn"
        aria-label={`${name}往下`}
        disabled={i === length - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button type="button" className="adm-icon-btn adm-icon-btn-flare" aria-label={`刪除${name}`} onClick={onRemove}>
        刪除
      </button>
    </div>
  );

  return (
    <div className="adm-form pg-editor">
      <fieldset className="adm-tabs pg-langs">
        <legend className="sr-only">編輯哪個語系</legend>
        {EDIT_LOCALES.map((l) => (
          <button
            key={l.key}
            type="button"
            className="adm-tab"
            aria-pressed={lang === l.key}
            onClick={() => setLang(l.key)}
          >
            <span className="adm-tab-dot" aria-hidden="true" />
            {l.label}
          </button>
        ))}
        <span className="adm-meta">{isDefault ? '繁中一定要填' : '留空就顯示繁中'}</span>
      </fieldset>

      <SectionHead id="pg-about-chapters">每一年 · 往下掉經過的</SectionHead>
      <p className="adm-meta">一年一句話。年份寫 NOW 會顯示成「現在」，那一章的標題也會出現在落地處。</p>
      {draft.chapters.map((c, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row pg-row-chapter">
          <label className="adm-field pg-year">
            <span className="adm-caps">年份</span>
            <input
              value={c.year}
              onChange={(e) =>
                set({ chapters: draft.chapters.map((x, k) => (k === i ? { ...x, year: e.target.value } : x)) })
              }
              placeholder="2004"
            />
          </label>
          <label className="adm-field">
            <span className="adm-caps">標題</span>
            {text(
              c.title,
              (title) => set({ chapters: draft.chapters.map((x, k) => (k === i ? { ...x, title } : x)) }),
              '標題',
            )}
          </label>
          <label className="adm-field">
            <span className="adm-caps">副標</span>
            {text(
              c.subtitle,
              (subtitle) => set({ chapters: draft.chapters.map((x, k) => (k === i ? { ...x, subtitle } : x)) }),
              '副標',
            )}
          </label>
          <label className="adm-field pg-wide">
            <span className="adm-caps">那一句</span>
            {text(
              c.line,
              (line) => set({ chapters: draft.chapters.map((x, k) => (k === i ? { ...x, line } : x)) }),
              '那一句',
              true,
            )}
          </label>
          {rowActions(
            i,
            draft.chapters.length,
            (by) => set({ chapters: move(draft.chapters, i, by) }),
            () => set({ chapters: draft.chapters.filter((_, k) => k !== i) }),
            `第 ${i + 1} 章`,
          )}
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
          <label className="adm-field">
            <span className="adm-caps">分組</span>
            {text(
              g.label,
              (label) => set({ skills: draft.skills.map((x, k) => (k === i ? { ...x, label } : x)) }),
              '分組',
            )}
          </label>
          <label className="adm-field pg-wide">
            <span className="adm-caps">項目 · 逗號隔開，不分語系</span>
            <input
              defaultValue={g.items.join(', ')}
              onBlur={(e) =>
                set({ skills: draft.skills.map((x, k) => (k === i ? { ...x, items: splitItems(e.target.value) } : x)) })
              }
              placeholder="React, TypeScript, Rust"
            />
          </label>
          {rowActions(
            i,
            draft.skills.length,
            (by) => set({ skills: move(draft.skills, i, by) }),
            () => set({ skills: draft.skills.filter((_, k) => k !== i) }),
            `第 ${i + 1} 組`,
          )}
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
              onChange={(e) =>
                set({ jobs: draft.jobs.map((x, k) => (k === i ? { ...x, period: e.target.value } : x)) })
              }
              placeholder="2025/7 — Now"
            />
          </label>
          <label className="adm-field">
            <span className="adm-caps">單位</span>
            {text(j.title, (title) => set({ jobs: draft.jobs.map((x, k) => (k === i ? { ...x, title } : x)) }), '單位')}
          </label>
          <label className="adm-field">
            <span className="adm-caps">職稱</span>
            {text(j.role, (role) => set({ jobs: draft.jobs.map((x, k) => (k === i ? { ...x, role } : x)) }), '職稱')}
          </label>
          {rowActions(
            i,
            draft.jobs.length,
            (by) => set({ jobs: move(draft.jobs, i, by) }),
            () => set({ jobs: draft.jobs.filter((_, k) => k !== i) }),
            `第 ${i + 1} 段經歷`,
          )}
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

      <div className="adm-form-actions pg-save">
        <span className="adm-meta">{dirty ? '還沒存' : '跟前台一樣'}</span>
        <button type="button" className="adm-btn" disabled={!dirty || saving} onClick={() => setEdited(null)}>
          還原
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? '儲存中' : '儲存'}
        </button>
      </div>
    </div>
  );
}
