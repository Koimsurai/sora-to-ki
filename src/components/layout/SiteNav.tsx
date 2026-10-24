// 站台的導覽列（2026-10 翻新）：一行字。左邊是名字，右邊五個分區，所在的那一區前面亮著一個琥珀點；
// 滑過別的分區，點會滑過去。往下捲收成右上角一個點，往回捲或點那個點就展開。
// 「更多」往下畫出其他頁，連同搜尋、語言、帳號。手機上只有名字與那個點，點開是整頁的目錄。
// 首頁平常只有名字與那個點：五顆衛星就是導覽（home/HomeOrbit）。點那個點，那一行字從點的位置
// 往左展開；滑鼠離開、按 Esc 或點別處就收回去。其他頁收成點之後，點它也是同樣地展開。
// 沒有背景色塊、沒有毛玻璃：只有往下漸淡的一層紙色，讓捲上來的內容不會撞到字。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaGoogle } from 'react-icons/fa';
import { LocaleLink } from '@/i18n/locale-link';
import { LOCALE_LABELS, stripLocalePrefix } from '@/i18n/start-i18n';
import { SUPPORTED_LOCALES, LOCALE_PREFIX, type Locale } from '@/lib/locales';
import { useAuth } from '@/contexts/auth';
import { openCommandPalette } from '@/store/commandPaletteStore';
import { MAIN_SECTIONS, MORE_SECTIONS, type SiteSection } from '@/data/siteSections';
import './SiteNav.css';

const MAIN = MAIN_SECTIONS;
const MORE = MORE_SECTIONS;
type Item = SiteSection;

/** 往下捲超過這個距離才收成點；回到這個距離以內一定展開 */
const SLIM_AFTER = 80;

export default function SiteNav() {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname);
  const isHome = bare === '';
  const navigate = useNavigate();
  const { user, isLoggedIn, isAdmin, logout, providers, getGitHubAuthUrl, getGoogleAuthUrl } = useAuth();

  const [slim, setSlim] = useState(false);
  /** 收成點之後被點開了（首頁平常就是收著的） */
  const [unfolded, setUnfolded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const linksRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const folded = (isHome || slim) && !unfolded && !moreOpen;
  const activeMain = MAIN.findIndex((it) => it.match(bare));
  const inMore = MORE.some((it) => it.match(bare));
  // 琥珀點停在所在的分區；在「更多」裡的頁面、或「更多」展開時，停在「更多」上；首頁沒有點
  const restIndex = moreOpen || (activeMain < 0 && inMore) ? MAIN.length : activeMain;

  // 琥珀點的位置是量出來的（連結的寬度跟著字型與語系變），直接寫到元素上，不經過 state
  const moveDotTo = (index: number) => {
    const dot = dotRef.current;
    const el = linksRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]')[index];
    if (!dot) return;
    dot.classList.toggle('is-on', Boolean(el));
    if (el) dot.style.setProperty('--x', `${el.offsetLeft}px`);
  };
  useLayoutEffect(() => {
    moveDotTo(restIndex);
    // 字型換上來之後寬度會變，琥珀點要再對一次（型別說 document.fonts 一定在，jsdom 裡就沒有）
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => moveDotTo(restIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟著所在分區與語系重算
  }, [restIndex, i18n.language]);

  // 換頁就收起所有展開的東西（在 render 裡比對上一次的路徑，不用多一輪 effect）
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMoreOpen(false);
    setMenuOpen(false);
    setUnfolded(false);
  }

  // 往下捲收成點、往回捲展開
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= SLIM_AFTER) setSlim(false);
      else if (y > last + 6) {
        setSlim(true);
        setUnfolded(false);
        setMoreOpen(false);
      } else if (y < last - 6) setSlim(false);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Esc 關掉；點外面也關掉（「更多」與點開的那一行）
  useEffect(() => {
    if (!moreOpen && !menuOpen && !unfolded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMoreOpen(false);
      setMenuOpen(false);
      setUnfolded(false);
    };
    const onDown = (e: MouseEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setMoreOpen(false);
      setUnfolded(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [moreOpen, menuOpen, unfolded]);

  // 展開的那一行：滑鼠離開導覽列一會兒就收回去（首頁的主角是土星，不要一直擋在那裡）
  const leaveTimerRef = useRef(0);
  const onNavEnter = () => window.clearTimeout(leaveTimerRef.current);
  const onNavLeave = () => {
    if (!unfolded || moreOpen) return;
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => setUnfolded(false), 1200);
  };
  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  // 手機的整頁目錄開著時，底下的頁面不要跟著捲
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const current = i18n.resolvedLanguage ?? i18n.language;
  const switchLocale = (code: Locale) => {
    void i18n.changeLanguage(code);
    // 同一個路徑換語系前綴（見 LanguagePicker 的說明：一定要換網址，只換語言內容不會跟著換）
    const prefix = LOCALE_PREFIX[code];
    const target = `/${[prefix, bare].filter(Boolean).join('/')}`;
    if (target !== pathname) void navigate({ href: target });
  };
  const signIn = (url: (redirect: string) => string, state: string) => {
    sessionStorage.setItem('oauth_return_to', pathname);
    window.location.href = `${url(`${window.location.origin}/auth/callback`)}&state=${state}`;
  };

  const utilities = (
    <div className="snav-util">
      <button type="button" onClick={openCommandPalette}>
        {t('siteNav.search')}
        <kbd>⌘K</kbd>
      </button>
      <fieldset className="snav-util-group">
        <legend className="sr-only">{t('siteNav.language')}</legend>
        {SUPPORTED_LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            className={code === current ? 'is-on' : undefined}
            aria-current={code === current ? 'true' : undefined}
            onClick={() => switchLocale(code)}
          >
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </fieldset>
      <fieldset className="snav-util-group">
        <legend className="sr-only">{t('siteNav.account')}</legend>
        {isLoggedIn ? (
          <>
            <span className="snav-user">{user?.displayName}</span>
            {isAdmin && (
              <button type="button" onClick={() => window.location.assign('/admin')}>
                {t('user.adminPanel')}
              </button>
            )}
            <button type="button" onClick={logout}>
              {t('user.logout')}
            </button>
          </>
        ) : (
          <>
            {(providers.github.enabled || providers.google.enabled) && (
              <span aria-hidden="true">{t('siteNav.signIn')}</span>
            )}
            {providers.github.enabled && (
              <button
                type="button"
                className="snav-provider"
                aria-label={t('user.signInWithGithub')}
                title={t('user.signInWithGithub')}
                onClick={() => signIn(getGitHubAuthUrl, 'github')}
              >
                <FaGithub aria-hidden="true" />
              </button>
            )}
            {providers.google.enabled && (
              <button
                type="button"
                className="snav-provider"
                aria-label={t('user.signInWithGoogle')}
                title={t('user.signInWithGoogle')}
                onClick={() => signIn(getGoogleAuthUrl, 'google')}
              >
                <FaGoogle aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </fieldset>
    </div>
  );

  const label = (it: Item) => t(`siteNav.${it.key}`);

  return (
    <header
      ref={headerRef}
      className={`snav${isHome ? ' is-home' : ''}${slim ? ' is-slim' : ''}${folded ? ' is-folded' : ''}${moreOpen ? ' is-more' : ''}${menuOpen ? ' is-menu' : ''}`}
      onPointerEnter={onNavEnter}
      onPointerLeave={onNavLeave}
    >
      <div className="snav-bar">
        <LocaleLink to="/" className="snav-name" aria-label={t('siteNav.home')}>
          Koimsurai
        </LocaleLink>

        <nav className="snav-links" aria-label={t('nav.menu')}>
          {/* onMouseLeave 只是讓琥珀點回到所在分區，純視覺；連結本身都在焦點序列裡 */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div ref={linksRef} className="snav-row" onMouseLeave={() => moveDotTo(restIndex)}>
            <span ref={dotRef} className="snav-dot" aria-hidden />
            {MAIN.map((it, i) => (
              <LocaleLink
                key={it.key}
                to={it.to}
                data-nav-item
                className={i === activeMain ? 'is-on' : undefined}
                aria-current={i === activeMain ? 'page' : undefined}
                onMouseEnter={() => moveDotTo(i)}
                onFocus={() => moveDotTo(i)}
              >
                {label(it)}
              </LocaleLink>
            ))}
            <button
              type="button"
              data-nav-item
              className={inMore ? 'is-on' : undefined}
              aria-expanded={moreOpen}
              aria-controls="snav-more"
              onMouseEnter={() => moveDotTo(MAIN.length)}
              onFocus={() => moveDotTo(MAIN.length)}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {t('siteNav.more')}
            </button>
          </div>
        </nav>

        <button
          type="button"
          className="snav-pin"
          aria-label={t('siteNav.menu')}
          aria-expanded={menuOpen || !folded}
          // 桌機：滑到點上就展開，不用點（觸控沒有 hover，照舊點一下）
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse' && !window.matchMedia('(max-width: 768px)').matches) setUnfolded(true);
          }}
          onClick={() => {
            // 手機：開關整頁目錄；桌機：那一行字從點的位置展開
            if (window.matchMedia('(max-width: 768px)').matches) setMenuOpen((v) => !v);
            else setUnfolded(true);
          }}
        />
      </div>

      <div id="snav-more" className="snav-more" inert={!moreOpen}>
        <div className="snav-more-links">
          {MORE.map((it) => (
            <LocaleLink
              key={it.key}
              to={it.to}
              className={it.match(bare) ? 'is-on' : undefined}
              aria-current={it.match(bare) ? 'page' : undefined}
            >
              {label(it)}
              <span>{it.caps}</span>
            </LocaleLink>
          ))}
        </div>
        {utilities}
      </div>

      <div className="snav-menu" inert={!menuOpen} aria-label={t('siteNav.menu')}>
        <div className="snav-menu-main">
          {MAIN.map((it, i) => (
            <LocaleLink
              key={it.key}
              to={it.to}
              className={i === activeMain ? 'is-on' : undefined}
              aria-current={i === activeMain ? 'page' : undefined}
            >
              {label(it)}
              <span>{it.caps}</span>
            </LocaleLink>
          ))}
        </div>
        <div className="snav-menu-more">
          {MORE.map((it) => (
            <LocaleLink
              key={it.key}
              to={it.to}
              className={it.match(bare) ? 'is-on' : undefined}
              aria-current={it.match(bare) ? 'page' : undefined}
            >
              {label(it)}
            </LocaleLink>
          ))}
        </div>
        {utilities}
      </div>
    </header>
  );
}
