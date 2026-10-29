import { useState } from 'react';
import type { LogContent } from '@koimsurai/api-types';

import { logContentQueryOptions, normalizeLog } from '@/data/pageContent';
import { AdminDateField, AdminSelect } from './AdminFields';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 航行日誌：軌跡與任務計時器的起點、軌跡上的里程碑。
// 貢獻圖、今天寫了多久程式、最近在玩什麼是整合抓的（站台設定的 GitHub、WakaTime、Steam），不在這裡。

const LEVELS = [
  { value: '0', label: '小點 · 滑過才看得到' },
  { value: '1', label: '中點 · 比較大的轉折' },
  { value: '2', label: '大點 · 名字標在軌跡上' },
];

/** 這台瀏覽器的時區，寫成 +08:00 這種樣子：起點存的是「那一天的零點」帶時區 */
function localOffset(): string {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const abs = Math.abs(m);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export default function LogEditor() {
  const [lang, setLang] = useState('zh-TW');
  const page = usePageDraft(
    logContentQueryOptions,
    '/api/admin/pages/log',
    (raw) => normalizeLog(raw as LogContent),
    '航行日誌已更新',
  );
  const { draft, set } = page;
  if (page.isPending || !draft) return <AdminLoading />;

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} />

      <SectionHead id="pg-log-start">起點 · 站點誕生那一天</SectionHead>
      <p className="adm-meta">軌跡從這一天畫起，右上角的任務經過時間也從這天的零點開始數。清空就用第一篇文章那天。</p>
      <div className="pg-row">
        <div className="adm-field">
          <span className="adm-caps">日期</span>
          <AdminDateField
            label="起點日期"
            value={draft.start.slice(0, 10)}
            onChange={(date) => set({ start: date ? `${date}T00:00:00${localOffset()}` : '' })}
          />
        </div>
      </div>

      <SectionHead id="pg-log-milestones">里程碑 · 軌跡上的點</SectionHead>
      {draft.milestones.map((m, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row pg-row-chapter">
          <div className="adm-field pg-year">
            <span className="adm-caps">日期</span>
            <AdminDateField
              label={`第 ${i + 1} 個里程碑的日期`}
              value={m.date}
              onChange={(date) => set({ milestones: replaceAt(draft.milestones, i, { date }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">寫什麼</span>
            <I18nInput
              lang={lang}
              label="里程碑"
              value={m.text}
              onChange={(text) => set({ milestones: replaceAt(draft.milestones, i, { text }) })}
            />
          </div>
          <div className="adm-field">
            <span className="adm-caps">大小</span>
            <AdminSelect
              label={`第 ${i + 1} 個里程碑的大小`}
              value={String(m.level ?? 0)}
              options={LEVELS}
              onChange={(v) => set({ milestones: replaceAt(draft.milestones, i, { level: Number(v) }) })}
            />
          </div>
          <RowActions
            index={i}
            length={draft.milestones.length}
            name={`第 ${i + 1} 個里程碑`}
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
        ＋ 加一個里程碑
      </button>

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
