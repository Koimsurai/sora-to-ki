import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { MegaMenuPanel, MegaMenuColumn } from './MegaMenu';
import { FrameIcon } from '@/components/animate-ui/icons/frame';
import { RadioTowerIcon } from '@/components/animate-ui/icons/radio-tower';
import { AudioLinesIcon } from '@/components/animate-ui/icons/audio-lines';
import { ClockIcon } from '@/components/animate-ui/icons/clock';
import { BookOpenTextIcon, EyeIcon } from '@animateicons/react/lucide';

/**
 * @animateicons/react 的 icon 不會 watch isAnimated prop 變化來播動畫，
 * 它走 imperative handle（startAnimation / stopAnimation），所以需要拿 ref。
 */
function AnimateIconsLibIcon({ Comp, size = 16, duration = 0.6, hover }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (hover) ref.current.startAnimation?.();
    else ref.current.stopAnimation?.();
  }, [hover]);
  return <Comp ref={ref} size={size} duration={duration} />;
}

/**
 * 單一 menu link：用 hover state 驅動 icon animate prop。
 * 同時支援 animate-ui（animate prop）跟 @animateicons/react（ref imperative）兩家。
 */
function AnimatedMenuLink({ to, AnimIcon, FallbackIcon, AnimateIconsLib, title }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      className="mega-menu-link mega-menu-link--compact"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={`mega-menu-link-icon${(AnimIcon || AnimateIconsLib) ? ' mega-menu-link-icon--motion' : ''}`}>
        {AnimIcon
          ? <AnimIcon size={16} animate={hover ? 'default' : false} />
          : AnimateIconsLib
            ? <AnimateIconsLibIcon Comp={AnimateIconsLib} hover={hover} />
            : <FallbackIcon />
        }
      </span>
      <span className="mega-menu-link-title">{title}</span>
    </Link>
  );
}

/**
 * 更多 menu 內容：兩欄分組（生活 / 個人）
 */
function MoreMenuContent() {
  const { t } = useTranslation();
  // 兩欄 3-3：生活（在看/照片/動態）｜收藏（書櫃/音樂/配備）
  // 成長軌跡已併入 /about（首頁選單的頁面欄），不再出現在這裡
  // 說明文字拔掉，跟首頁選單同款 compact 對齊
  const life = [
    { to: '/watch',     AnimateIconsLib: EyeIcon,            title: t('megaMenu.items.watch') },
    { to: '/photos',    AnimIcon: FrameIcon,                 title: t('megaMenu.items.photos') },
    { to: '/activity',  AnimIcon: RadioTowerIcon,            title: t('megaMenu.items.activity') },
  ];
  const collection = [
    { to: '/bookshelf', AnimateIconsLib: BookOpenTextIcon,   title: t('megaMenu.items.bookshelf') },
    { to: '/music',     AnimIcon: AudioLinesIcon,            title: t('megaMenu.items.music') },
    { to: '/setup',     FallbackIcon: Monitor,               title: t('megaMenu.items.setup') },
  ];

  const renderLinks = (items) => items.map((e) => (
    <AnimatedMenuLink key={e.to} {...e} />
  ));

  return (
    <MegaMenuPanel className="mega-menu-panel--balanced">
      <MegaMenuColumn title={t('megaMenu.groups.life')}>{renderLinks(life)}</MegaMenuColumn>
      <MegaMenuColumn title={t('megaMenu.groups.collection')}>{renderLinks(collection)}</MegaMenuColumn>
    </MegaMenuPanel>
  );
}

export default MoreMenuContent;
