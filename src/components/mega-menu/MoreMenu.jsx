import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { MegaMenuPanel, MegaMenuColumn } from './MegaMenu';
import { FrameIcon } from '@/components/animate-ui/icons/frame';
import { RadioTowerIcon } from '@/components/animate-ui/icons/radio-tower';
import { AudioLinesIcon } from '@/components/animate-ui/icons/audio-lines';
import { ClockIcon } from '@/components/animate-ui/icons/clock';
import { RouteIcon } from '@/components/animate-ui/icons/route';
import { BookOpenTextIcon } from '@animateicons/react/lucide';

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
function AnimatedMenuLink({ to, AnimIcon, FallbackIcon, AnimateIconsLib, title, desc }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      className="mega-menu-link"
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
      <span className="mega-menu-link-text">
        <span className="mega-menu-link-title">{title}</span>
        <span className="mega-menu-link-desc">{desc}</span>
      </span>
    </Link>
  );
}

/**
 * 更多 menu 內容：兩欄分組（生活 / 個人）
 */
function MoreMenuContent() {
  const life = [
    { to: '/photos',    AnimIcon: FrameIcon,                 title: '照片',     desc: '攝影作品集' },
    { to: '/activity',  AnimIcon: RadioTowerIcon,            title: '動態',     desc: '最新活動' },
    { to: '/bookshelf', AnimateIconsLib: BookOpenTextIcon,   title: '書櫃',     desc: '閱讀紀錄' },
    { to: '/music',     AnimIcon: AudioLinesIcon,            title: '音樂',     desc: '喜愛的音樂' },
  ];
  const personal = [
    { to: '/journey', AnimIcon: RouteIcon,    title: '成長軌跡', desc: '學習歷程' },
    { to: '/setup',   FallbackIcon: Monitor,  title: '配備',     desc: '設備清單' },
  ];

  const renderLinks = (items) => items.map((e) => (
    <AnimatedMenuLink key={e.to} {...e} />
  ));

  return (
    <MegaMenuPanel className="mega-menu-panel--balanced">
      <MegaMenuColumn title="生活">{renderLinks(life)}</MegaMenuColumn>
      <MegaMenuColumn title="個人">{renderLinks(personal)}</MegaMenuColumn>
    </MegaMenuPanel>
  );
}

export default MoreMenuContent;
