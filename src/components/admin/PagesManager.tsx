import { useEffect, useState, type ComponentType } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import AboutEditor from './AboutEditor';
import LogEditor from './LogEditor';
import QaEditor from './QaEditor';
import SetupEditor from './SetupEditor';
import UnsavedGuard from './UnsavedGuard';
import WorksEditor from './WorksEditor';
import { PageHead, TabPanel } from './AdminPage';
import {
  aboutContentQueryOptions,
  logContentQueryOptions,
  qaContentQueryOptions,
  setupContentQueryOptions,
  worksContentQueryOptions,
} from '@/data/pageContent';
import { useAdminT } from '@/i18n/admin-i18n';
import { defaultLocale } from '@/lib/locales';
import { PagesContext } from './pageDraft';
import { pageTabLabel } from './pageLabels';
import { PAGE_TABS, type PageTab } from './pageTabs';
import './PagesManager.css';

// 頁面內容（2026-10 頁面範本）：前台那幾頁的設計寫在程式裡，這裡只填「放進去的東西」。
// 一頁一個分頁；每一頁整份存（後端 PUT 整份覆蓋）。
// 改到一半的草稿與正在編的語系放在這裡（PagesContext），切分頁不會丟；有沒存的分頁，名字前的點是空心琥珀。

const EDITORS: Record<PageTab, ComponentType> = {
  about: AboutEditor,
  works: WorksEditor,
  log: LogEditor,
  qa: QaEditor,
  setup: SetupEditor,
};

/** 每個分頁的編輯器存到哪（pageDraft 的草稿以它為鍵） */
const draftKey = (tab: PageTab) => `/api/admin/pages/${tab}`;

export default function PagesManager() {
  // 不綁定路由（strict: false）：元件掛載測試會在別的路由底下掛它；值照樣由路由的 validateSearch 驗過
  const search: { tab?: unknown } = useSearch({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tab: PageTab = PAGE_TABS.find((t) => t.key === search.tab)?.key ?? 'about';
  const Editor = EDITORS[tab];
  const { t } = useAdminT();
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [lang, setLang] = useState<string>(defaultLocale);

  // 五頁的內容都不大：一進來就一起抓，之後切分頁不會再先閃一下「載入中」
  // （抓不到就算了：切過去時編輯器自己會再抓一次）
  useEffect(() => {
    const ignore = () => undefined;
    void queryClient.query(aboutContentQueryOptions).catch(ignore);
    void queryClient.query(worksContentQueryOptions).catch(ignore);
    void queryClient.query(logContentQueryOptions).catch(ignore);
    void queryClient.query(qaContentQueryOptions).catch(ignore);
    void queryClient.query(setupContentQueryOptions).catch(ignore);
  }, [queryClient]);

  const setDraft = (url: string, draft: unknown) =>
    setDrafts((prev) => {
      const { [url]: _, ...rest } = prev;
      return draft === null ? rest : { ...rest, [url]: draft };
    });

  return (
    <PagesContext value={{ drafts, setDraft, lang, setLang }}>
      <div className="adm-page adm-page-narrow">
        <PageHead title={t('pages.title')} latin="Pages" meta={t('pages.meta')} />
        <section className="adm-stack" aria-label={t('pages.sectionLabel')}>
          <div className="adm-toolbar">
            <div className="adm-tabs">
              {PAGE_TABS.map((p) => {
                const dirty = draftKey(p.key) in drafts;
                return (
                  <button
                    key={p.key}
                    type="button"
                    className="adm-tab"
                    aria-pressed={tab === p.key}
                    data-dirty={dirty || undefined}
                    // 只換下半塊：不走後台換頁那段整頁轉場（頁名與分頁列沒變，整頁淡出會疊出兩份）
                    onClick={() => void navigate({ to: '/admin/pages', search: { tab: p.key }, viewTransition: false })}
                  >
                    <span className="adm-tab-dot" aria-hidden="true" />
                    {pageTabLabel(p.key)}
                    {dirty && <span className="sr-only">（{t('pages.unsaved')}）</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <TabPanel tab={tab}>
            <Editor />
          </TabPanel>
        </section>
        <UnsavedGuard dirty={Object.keys(drafts).length > 0} />
      </div>
    </PagesContext>
  );
}
