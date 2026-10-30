import type { ComponentType } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import AboutEditor from './AboutEditor';
import LogEditor from './LogEditor';
import QaEditor from './QaEditor';
import SetupEditor from './SetupEditor';
import WorksEditor from './WorksEditor';
import { PageHead, TabPanel } from './AdminPage';
import { useAdminT } from '@/i18n/admin-i18n';
import { PAGE_TABS, pageTabLabel, type PageTab } from './pageTabs';
import './PagesManager.css';

// 頁面內容（2026-10 頁面範本）：前台那幾頁的設計寫在程式裡，這裡只填「放進去的東西」。
// 一頁一個分頁；每一頁整份存（後端 PUT 整份覆蓋），存之前都只在這個分頁裡。

const EDITORS: Record<PageTab, ComponentType> = {
  about: AboutEditor,
  works: WorksEditor,
  log: LogEditor,
  qa: QaEditor,
  setup: SetupEditor,
};

export default function PagesManager() {
  // 不綁定路由（strict: false）：元件掛載測試會在別的路由底下掛它；值照樣由路由的 validateSearch 驗過
  const search: { tab?: unknown } = useSearch({ strict: false });
  const navigate = useNavigate();
  const tab: string = PAGE_TABS.find((t) => t.key === search.tab)?.key ?? 'about';
  const Editor = EDITORS[PAGE_TABS.find((t) => t.key === tab)?.key ?? 'about'];
  const { t } = useAdminT();

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead title={t('pages.title')} latin="Pages" meta={t('pages.meta')} />
      <section className="adm-stack" aria-label={t('pages.sectionLabel')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {PAGE_TABS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === p.key}
                onClick={() => void navigate({ to: '/admin/pages', search: { tab: p.key } })}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {pageTabLabel(p.key)}
              </button>
            ))}
          </div>
        </div>
        <TabPanel tab={tab}>
          <Editor />
        </TabPanel>
      </section>
    </div>
  );
}
