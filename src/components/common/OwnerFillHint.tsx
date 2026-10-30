import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/auth';
import type { PageTab } from '@/components/admin/pageTabs';
import './OwnerFillHint.css';

// 站長填的頁面（關於、作品…）還空著時，右下角一個小標籤帶站長去後台填。
// 讀者看不到：空著的頁面對讀者就是一頁還很安靜的完整頁面，不放「這裡還沒有內容」這種字。
// 掛到 body 底下：頁面的外層有 transform（換頁轉場），fixed 在它裡面會跟著那一層跑

export default function OwnerFillHint({ page }: { page: PageTab }) {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  // 登入狀態只在瀏覽器裡知道，伺服器那一輪 isAdmin 一定是 false，不會碰到 document
  if (!isAdmin) return null;
  return createPortal(
    <Link to="/admin/pages" search={{ tab: page }} className="owner-fill-hint">
      {t('common.ownerFillHint')}
    </Link>,
    document.body,
  );
}
