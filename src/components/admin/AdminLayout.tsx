import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, type LinkProps } from '@tanstack/react-router';

import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '../../contexts/auth';
import { useEditorScheduledAt } from '@/store/editorScheduleStore';
import AdminScrollbars from './AdminScrollbars';
import './AdminTheme.css';
import './AdminLayout.css';

// 後台的外框（2026-10 後台提案）：左邊一條側欄，分組跟前台的分區對應——此刻、寫、收、回、站；
// 現在在哪一頁是琥珀實心點，其他是空心小圓。編輯器那幾頁沒有側欄（整個寬度留給寫作），
// 換成一條只有「回手記」與存檔、發佈的頂列。

// path 用 Link 的 `to` 型別而不是 string：側欄路徑寫錯（或某天路由改名）會在編譯期就被抓到。
type AdminPath = NonNullable<LinkProps['to']>;

interface NavItem {
  label: string;
  path: AdminPath;
  ownerOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// 只放已經存在的頁。提案裡的碎念、訊號、外部連線等做出來了再加進來，
// 不先放一個點進去是空頁的入口。
const NAV: NavGroup[] = [
  { label: '此刻', items: [{ label: '總覽', path: '/admin/dashboard' }] },
  {
    label: '寫 · Write',
    items: [
      { label: '手記', path: '/admin/posts' },
      { label: '碎念', path: '/admin/thoughts' },
      { label: '分類', path: '/admin/categories' },
      { label: '標籤', path: '/admin/tags' },
    ],
  },
  {
    label: '收 · Keep',
    items: [
      { label: '收藏', path: '/admin/collection' },
      { label: '書架', path: '/admin/books' },
      { label: '照片', path: '/admin/photos' },
    ],
  },
  {
    label: '回 · Reply',
    items: [
      { label: '留言', path: '/admin/comments' },
      { label: '友鏈', path: '/admin/friends' },
      { label: '電子報', path: '/admin/subscribers' },
    ],
  },
  { label: '站 · Station', items: [{ label: '帳號', path: '/admin/users', ownerOnly: true }] },
];

const isEditorPath = (p: string) => p.startsWith('/admin/posts/edit') || p.startsWith('/admin/posts/create');

/** /admin 本身就是總覽（routes/admin/index.tsx），側欄的點要停在總覽上 */
function isActive(pathname: string, path: string): boolean {
  if (path === '/admin/dashboard' && /^\/admin\/?$/.test(pathname)) return true;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * 編輯器頂列的三顆鈕。PostEditor 在表單裡放了三顆藏起來的鈕（同一組 id）做真正的送出——
 * 送出要經過 react-hook-form 的 handleSubmit，而那個實例只活在 PostEditor 裡。
 */
const clickEditorButton = (id: 'save-draft-btn' | 'save-exit-btn' | 'publish-btn') =>
  document.getElementById(id)?.click();

const AdminLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, isOwner } = useAuth();
  const editor = isEditorPath(pathname);
  // 編輯器裡填了排程時間，主要按鈕就是「排程發佈」
  const scheduledAt = useEditorScheduledAt();

  // TanStack 的 navigate 收物件（`{ to }`）而不是字串，這是與 react-router 最主要的簽名差異。
  const handleLogout = () => {
    logout();
    void navigate({ to: '/' });
  };

  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => {
      document.body.classList.remove('admin-mode');
    };
  }, []);

  const close = () => setMenuOpen(false);
  const name = user?.displayName ?? user?.name ?? '站長';
  const role = user?.role === 'OWNER' ? '站長' : '管理員';

  return (
    <div className="admin-layout">
      {/*
        後台的 toast 出口。`components/ui/sonner.tsx` 連配色都寫好了，但在這行之前
        **沒有任何地方掛載它**——於是 11 個後台元件裡所有的 `toast.success/error`
        全部靜靜地不見，站長按下儲存、發佈、刪除都沒有任何回饋。

        比「少了提示」更嚴重的是 PostEditor 的**草稿還原**：自動備份確實寫進
        localStorage，但唯一的還原入口是 toast 裡的「還原」按鈕，那顆按鈕從來
        沒有出現過——備份寫了卻永遠取不回來。整個功能等於是死的。
        （是寫 e2e 時發現的：存草稿明明回 201 也轉頁了，畫面上卻找不到任何 toast。）

        ⚠️ 位置要放在 `<Outlet />` **之前**。sonner 的 `toast()` 是推給已經訂閱的
        Toaster，而 React 的 effect 依樹的順序跑——放在 Outlet 後面的話，
        頁面元件「在掛載當下就發出」的那些 toast（PostEditor 的草稿還原提示就是）
        會在 Toaster 訂閱之前送出，直接消失。使用者按鈕觸發的看起來正常，
        只有這種開場提示會不見，很難察覺。

        掛在這裡而不是 __root：目前 `toast` 的使用者全部在 components/admin/ 底下。
      */}
      <Toaster />
      <AdminScrollbars />

      {!editor && (
        <aside id="adm-side" className="adm-side" data-open={menuOpen || undefined}>
          <div className="adm-brand">
            <Link to="/admin/dashboard" className="adm-wordmark" onClick={close}>
              sora to ki
            </Link>
            <span className="adm-caps">管制室 · Admin</span>
          </div>

          <nav className="adm-nav" aria-label="後台">
            {NAV.map((group) => {
              const items = group.items.filter((item) => !item.ownerOnly || isOwner);
              if (items.length === 0) return null;
              return (
                <div key={group.label} className="adm-group">
                  <span className="adm-caps adm-group-label">{group.label}</span>
                  <ul>
                    {items.map((item) => {
                      const active = isActive(pathname, item.path);
                      return (
                        <li key={item.path}>
                          <Link
                            to={item.path}
                            className="adm-link"
                            aria-current={active ? 'page' : undefined}
                            onClick={close}
                          >
                            <span className="adm-dot" aria-hidden="true" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          <div className="adm-foot">
            <Link to="/" className="adm-foot-link">
              回到前台 ↗
            </Link>
            <div className="adm-who">
              <span>
                {name} · {role}
              </span>
              <button type="button" className="adm-btn adm-btn-small" onClick={handleLogout}>
                登出
              </button>
            </div>
          </div>
        </aside>
      )}

      {menuOpen && <button type="button" className="adm-scrim" aria-label="收起選單" onClick={close} />}

      <div className="adm-body" data-editor={editor || undefined}>
        {editor ? (
          <header className="adm-editbar">
            <Link to="/admin/posts" className="adm-back">
              ← 手記
            </Link>
            <div className="adm-editbar-actions">
              <button type="button" className="adm-btn" onClick={() => clickEditorButton('save-draft-btn')}>
                儲存草稿
              </button>
              <button type="button" className="adm-btn" onClick={() => clickEditorButton('save-exit-btn')}>
                存並回列表
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                onClick={() => clickEditorButton('publish-btn')}
              >
                {scheduledAt ? '排程發佈' : '發佈文章'}
              </button>
            </div>
          </header>
        ) : (
          <div className="adm-mobilebar">
            <button
              type="button"
              className="adm-btn adm-btn-small"
              aria-expanded={menuOpen}
              aria-controls="adm-side"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? '收起' : '選單'}
            </button>
            <Link to="/admin/dashboard" className="adm-wordmark">
              sora to ki
            </Link>
          </div>
        )}

        <main className="adm-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
