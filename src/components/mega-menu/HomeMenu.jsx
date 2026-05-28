import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MegaMenuPanel, MegaMenuColumn } from './MegaMenu';
import avatarImage from '../../assets/me.jpg';
import { UserIcon } from '@/components/animate-ui/icons/user';
import { SparklesIcon } from '@/components/animate-ui/icons/sparkles';
import { LayersIcon } from '@/components/animate-ui/icons/layers';
import { SendIcon } from '@/components/animate-ui/icons/send';
import { HouseIcon, MailIcon, GithubIcon, LinkedinIcon, InfoIcon, CompassIcon, MessageCircleIcon, UsersIcon } from '@animateicons/react/lucide';
import { Link } from 'react-router-dom';

/**
 * @animateicons/react 走 imperative handle（startAnimation / stopAnimation），
 * 不會 watch isAnimated prop 變化來自動播動畫，所以需要 ref。
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
 * Section anchor：用 hover state 驅動 icon animate prop。
 * 同時支援 animate-ui（animate prop）跟 @animateicons/react（ref imperative）兩家。
 */
function AnimatedSectionLink({ id, AnimIcon, AnimateIconsLib, FallbackIcon, title, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      className="mega-menu-link mega-menu-link--compact"
      href={`#${id}`}
      onClick={onClick}
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
    </a>
  );
}

/**
 * 站點頁面的內部連結（此站點 / 歷史 / 留言）— 走 Link to=…，不是 hash anchor。
 */
function AnimatedSiteLink({ to, AnimateIconsLib, title, desc }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      className="mega-menu-link"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="mega-menu-link-icon mega-menu-link-icon--motion">
        <AnimateIconsLibIcon Comp={AnimateIconsLib} hover={hover} />
      </span>
      <span className="mega-menu-link-text">
        <span className="mega-menu-link-title">{title}</span>
        <span className="mega-menu-link-desc">{desc}</span>
      </span>
    </Link>
  );
}

function AnimatedSocial({ href, AnimIcon, label, external = true }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      className="mega-menu-social mega-menu-social--motion"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AnimateIconsLibIcon Comp={AnimIcon} size={14} duration={0.5} hover={hover} />
    </a>
  );
}

/**
 * 首頁 menu 內容：
 *   左欄：作者頭像 / 線上狀態 / 統計（文章 N 篇 / 字數 / 寫了多少天）/ 社群圖示
 *   右欄：首頁區段（首頁 / 關於 / 技能 / 作品 / 聯絡）
 */
function HomeMenuContent({ onSectionClick }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.message !== 'success') return;
        setStats({
          total: data.total_posts || 0,
          wordCount: data.total_chars || 0,
          days: data.days || 1,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const wordCountLabel = useMemo(() => {
    if (!stats || !stats.wordCount) return '—';
    if (stats.wordCount >= 10000) {
      return `${(stats.wordCount / 10000).toFixed(1)} 萬`;
    }
    if (stats.wordCount >= 1000) {
      return `${(stats.wordCount / 1000).toFixed(1)} 千`;
    }
    return String(stats.wordCount);
  }, [stats]);

  const sections = [
    { id: 'home',      AnimateIconsLib: HouseIcon, title: t('megaMenu.items.home') },
    { id: 'about-me',  AnimIcon: UserIcon,         title: t('megaMenu.items.about') },
    { id: 'expertise', AnimIcon: SparklesIcon,     title: t('megaMenu.items.expertise') },
    { id: 'portfolio', AnimIcon: LayersIcon,       title: t('megaMenu.items.portfolio') },
    { id: 'contact',   AnimIcon: SendIcon,         title: t('megaMenu.items.contact') },
  ];

  const siteLinks = [
    { to: '/about-site', AnimateIconsLib: InfoIcon,          title: t('megaMenu.items.aboutSite'), desc: t('megaMenu.items.aboutSiteDesc') },
    { to: '/history',    AnimateIconsLib: CompassIcon,       title: t('megaMenu.items.history'),   desc: t('megaMenu.items.historyDesc') },
    { to: '/messages',   AnimateIconsLib: MessageCircleIcon, title: t('megaMenu.items.messages'),   desc: t('megaMenu.items.messagesDesc') },
    { to: '/friends',    AnimateIconsLib: UsersIcon,         title: t('megaMenu.items.friends'),   desc: t('megaMenu.items.friendsDesc') },
  ];

  return (
    <MegaMenuPanel className="mega-menu-panel--compact">
      <MegaMenuColumn>
        <div className="mega-menu-profile mega-menu-profile--compact">
          <div className="mega-menu-profile-row">
            <div className="mega-menu-profile-avatar">
              <img src={avatarImage} alt="Koimsurai" loading="lazy" />
            </div>
            <div className="mega-menu-profile-text">
              <div className="mega-menu-profile-name">Koimsurai</div>
              <div className="mega-menu-profile-status">{t('megaMenu.online')}</div>
            </div>
          </div>
          <div className="mega-menu-stats">
            <div className="mega-menu-stat">
              <span className="mega-menu-stat-num">{stats?.total ?? '—'}</span>
              <span className="mega-menu-stat-label">{t('megaMenu.stats.posts')}</span>
            </div>
            <div className="mega-menu-stat">
              <span className="mega-menu-stat-num">{wordCountLabel}</span>
              <span className="mega-menu-stat-label">{t('megaMenu.stats.words')}</span>
            </div>
            <div className="mega-menu-stat">
              <span className="mega-menu-stat-num">{stats?.days ?? '—'}</span>
              <span className="mega-menu-stat-label">{t('megaMenu.stats.days')}</span>
            </div>
          </div>
          <div className="mega-menu-socials">
            <AnimatedSocial href="https://github.com/timo9378" AnimIcon={GithubIcon} label="GitHub" />
            <AnimatedSocial href="https://www.linkedin.com/in/timo9378" AnimIcon={LinkedinIcon} label="LinkedIn" />
            <AnimatedSocial href="mailto:timo9378@gmail.com" AnimIcon={MailIcon} label="Email" external={false} />
          </div>
        </div>
      </MegaMenuColumn>

      <MegaMenuColumn title={t('megaMenu.groups.pages')}>
        {sections.map((s) => (
          <AnimatedSectionLink
            key={s.id}
            {...s}
            onClick={(e) => onSectionClick?.(e, s.id)}
          />
        ))}
      </MegaMenuColumn>

      <MegaMenuColumn title={t('megaMenu.groups.site')}>
        {siteLinks.map((s) => (
          <AnimatedSiteLink key={s.to} {...s} />
        ))}
      </MegaMenuColumn>
    </MegaMenuPanel>
  );
}

export default HomeMenuContent;
