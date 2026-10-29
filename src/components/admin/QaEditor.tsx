import { useState } from 'react';
import type { QaContent } from '@koimsurai/api-types';

import { normalizeQa, qaContentQueryOptions } from '@/data/pageContent';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 此站點的問答：六分儀那片天空裡的「問答」星。一題都沒有時那顆星不出現。

export default function QaEditor() {
  const [lang, setLang] = useState('zh-TW');
  const page = usePageDraft(
    qaContentQueryOptions,
    '/api/admin/pages/qa',
    (raw) => normalizeQa(raw as QaContent),
    '問答已更新',
  );
  const qa = page.draft;
  if (page.isPending || !qa) return <AdminLoading />;
  const { items } = qa;
  const setItems = (next: typeof items) => page.set({ items: next });

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} />

      <SectionHead id="pg-qa-intro">介紹 · 對準「問答」星時，題目上面那一句</SectionHead>
      <div className="adm-field">
        <I18nInput lang={lang} label="介紹" value={qa.intro} onChange={(intro) => page.set({ intro })} />
      </div>

      <SectionHead id="pg-qa-items">問答 · 此站點的「問答」星</SectionHead>
      <p className="adm-meta">
        答案的寫法：空一行是分段、`程式碼`、[文字](網址)（/ 開頭是站內）；單獨一段的網址會變成文章卡。
      </p>
      {items.map((it, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={i} className="pg-row">
          <div className="adm-field pg-wide">
            <span className="adm-caps">問題</span>
            <I18nInput lang={lang} label="問題" value={it.q} onChange={(q) => setItems(replaceAt(items, i, { q }))} />
          </div>
          <div className="adm-field pg-wide">
            <span className="adm-caps">答案</span>
            <I18nInput
              lang={lang}
              label="答案"
              multiline
              value={it.a}
              onChange={(a) => setItems(replaceAt(items, i, { a }))}
            />
          </div>
          <RowActions
            index={i}
            length={items.length}
            name={`第 ${i + 1} 題`}
            onMove={(by) => setItems(move(items, i, by))}
            onRemove={() => setItems(items.filter((_, k) => k !== i))}
          />
        </div>
      ))}
      <button type="button" className="adm-btn pg-add" onClick={() => setItems([...items, { q: {}, a: {} }])}>
        ＋ 加一題
      </button>

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
