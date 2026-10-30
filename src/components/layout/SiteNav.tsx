// 站台的導覽列（2026-10 翻新）：一行字。左邊是名字，右邊五個分區，所在的那一區前面亮著一個琥珀點；
// 滑過別的分區，點會滑過去。往下捲收成右上角一個點，往回捲或點那個點就展開。
// 滑到一個分區上等一下，那一區的選單往下展開（layout/NavMenus）；開著的時候滑到別的分區直接換頁，
// 面板的高度跟著變、內容往滑過去的方向換。「更多」是其他頁，連同搜尋、語言、帳號。
// 手機上只有名字與那個點，點開是整頁的目錄。
// 首頁平常只有名字與那個點：五顆衛星就是導覽（home/HomeOrbit）。點那個點，那一行字從點的位置
// 往左展開；滑鼠離開、按 Esc 或點別處就收回去。其他頁收成點之後，點它也是同樣地展開。
// 沒有背景色塊、沒有毛玻璃：只有往下漸淡的一層紙色，讓捲上來的內容不會撞到字。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaGoogle } from 'react-icons/fa';
import { LocaleLink } from '@/i18n/locale-link';
import { LOCALE_LABELS, loadLocale, stripLocalePrefix } from '@/i18n/start-i18n';
import { enabledLocales, prefixOf, type Locale } from '@/lib/locales';
import { useAuth } from '@/contexts/auth';
import { openCommandPalette } from '@/store/commandPaletteStore';
import { ABOUT_SECTIONS, MAIN_SECTIONS, MORE_SECTIONS, type SiteSection } from '@/data/siteSections';
import { useEnabledSections, useSiteConfig } from '@/data/siteConfig';
import NavMenus, { type MenuKey } from './NavMenus';
import { ThemeGlyph } from '@/components/common/ThemeGlyph';
import { SkyRow } from './ThemeMenu';
import { useTheme } from '@/hooks/useTheme';
import { onThemeRequest } from '@/lib/theme';
import './SiteNav.css';

const MORE = MORE_SECTIONS;
type Item = SiteSection;

/** 往下捲超過這個距離才收成點；回到這個距離以內一定展開 */
const SLIM_AFTER = 80;
/** 滑到分區上停多久才展開選單（只是經過的不開） */
const OPEN_AFTER_MS = 280;
/** 滑鼠離開導覽列多久才收起選單（斜著往下移到選單時會短暫出界） */
const CLOSE_AFTER_MS = 320;
/**
 * 面板展開的動畫要多久（SiteNav.css 的 .snav-more，--dur-500）。滑過去停一下就展開，很多人滑到那裡、
 * 稍微停一下才點，那一下剛好碰到它正在展開：這段時間點了不收（原本會反過來把它收掉），完全展開之後再點才收
 */
const OPENING_MS = 500;
export default function SiteNav() {
  const { t, i18n } = useTranslation();
  const { author } = useSiteConfig();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname);
  const isHome = bare === '';
  const navigate = useNavigate();
  const { user, isLoggedIn, isAdmin, logout, providers, getGitHubAuthUrl, getGoogleAuthUrl } = useAuth();
  // 導覽列與選單裡列的只有站台設定沒關掉的頁面
  const MAIN = useEnabledSections(MAIN_SECTIONS);
  const moreOn = useEnabledSections(MORE);
  const theme = useTheme();
  const aboutOn = useEnabledSections(ABOUT_SECTIONS);
  /** 導覽列上的順序：開著的主要分區，最後是「更多」 */
  const MENU_KEYS: MenuKey[] = [...(MAIN.map((it) => it.key) as MenuKey[]), 'more', 'sky'];

  const [slim, setSlim] = useState(false);
  /** 收成點之後被點開了（首頁平常就是收著的） */
  const [unfolded, setUnfolded] = useState(false);
  /** 展開的是哪一區的選單 */
  const [open, setOpen] = useState<MenuKey | null>(null);
  /** 換頁的方向（1 往右、-1 往左），給內容決定從哪一側進來 */
  const [dir, setDir] = useState(1);
  /** 上一個開著的選單：換頁時它往反方向退出去 */
  const [was, setWas] = useState<MenuKey | null>(null);
  /** 開過一次選單之後才開始抓選單要的資料 */
  const [armed, setArmed] = useState(false);
  const moreOpen = open !== null;
  // 面板開在哪一側跟著最後開的那一個：天體在左邊（站名旁），其他在右邊。收起來的那段也要留在同一側，不然會一邊收一邊跳回去
  const sideRef = useRef<MenuKey | null>(null);
  if (open) sideRef.current = open;
  const skySide = sideRef.current === 'sky';
  // 按了一個天體（換主題）就把選單收起來：接著要演舊的收、新主星出場（layout/ThemeSwitchDot），選單不要蓋在上面
  useEffect(
    () =>
      onThemeRequest(() => {
        setOpen(null);
        setMenuOpen(false);
      }),
    [],
  );
  const setMoreOpen = (v: boolean) => setOpen(v ? 'more' : null);
  const [menuOpen, setMenuOpen] = useState(false);
  const linksRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const folded = (isHome || slim) && !unfolded && !moreOpen;
  const activeMain = MAIN.findIndex((it) => it.match(bare));
  const inMore = MORE.some((it) => it.match(bare));
  // 琥珀點停在所在的分區；在「更多」裡的頁面、或「更多」展開時，停在「更多」上；首頁沒有點
  // 天體不在那一排裡（在站名旁邊）：它的選單開著時，琥珀點照樣停在所在的分區
  const restIndex =
    open && open !== 'sky' ? MENU_KEYS.indexOf(open) : activeMain < 0 && inMore ? MAIN.length : activeMain;

  /** 選單是什麼時候打開（或換到另一頁）的：剛打開、還在展開的時候，點同一個不收（見 OPENING_MS） */
  const openedAtRef = useRef(0);
  const openMenu = (key: MenuKey) => {
    setOpen((prev) => {
      if (prev !== key) openedAtRef.current = performance.now();
      if (prev && prev !== key) {
        setDir(Math.sign(MENU_KEYS.indexOf(key) - MENU_KEYS.indexOf(prev)) || 1);
        setWas(prev);
      }
      return key;
    });
    setArmed(true);
  };
  // 滑到分區上：選單已經開著就直接換頁；還沒開就等一下再開（只是經過的不開）
  const intentRef = useRef(0);
  const hoverMenu = (key: MenuKey) => {
    window.clearTimeout(intentRef.current);
    if (open) openMenu(key);
    else intentRef.current = window.setTimeout(() => openMenu(key), OPEN_AFTER_MS);
  };
  const cancelIntent = () => window.clearTimeout(intentRef.current);
  useEffect(() => () => window.clearTimeout(intentRef.current), []);

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
      // 滑鼠還停在某一區上時，「停一下就展開」的計時還在跑；不清掉的話 Esc 關了它又自己打開
      window.clearTimeout(intentRef.current);
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

  // 滑鼠離開導覽列：選單一會兒就收起來；展開的那一行再久一點才收回去（首頁的主角是土星，不要一直擋在那裡）
  const leaveTimerRef = useRef(0);
  const onNavEnter = () => window.clearTimeout(leaveTimerRef.current);
  const onNavLeave = (e: React.PointerEvent) => {
    cancelIntent();
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(leaveTimerRef.current);
    if (moreOpen) leaveTimerRef.current = window.setTimeout(() => setOpen(null), CLOSE_AFTER_MS);
    else if (unfolded) leaveTimerRef.current = window.setTimeout(() => setUnfolded(false), 1200);
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

  // 面板的高度跟著開著的那一頁：量那一頁、寫到 --deck-h，CSS 去過渡（換頁時高度平滑地變）
  useLayoutEffect(() => {
    const deck = deckRef.current;
    const page = open ? deck?.querySelector<HTMLElement>(`.snav-page-${open}`) : null;
    if (!deck || !page) return;
    const fit = () => deck.style.setProperty('--deck-h', `${page.offsetHeight}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(page);
    return () => ro.disconnect();
  }, [open]);

  const current = i18n.resolvedLanguage ?? i18n.language;
  const switchLocale = async (code: Locale) => {
    // 別的語系的字串用到才載（i18n/start-i18n 的 loadLocale）：先載好、交給外殼這個實例，
    // 不然外殼換過去的那一下拿不到字，會先閃回預設語系。滑到按鈕上就開始載，點下去時多半已經在了
    if (!i18n.hasResourceBundle(code, 'common')) i18n.addResourceBundle(code, 'common', await loadLocale(code));
    void i18n.changeLanguage(code);
    // 同一個路徑換語系前綴：一定要換網址。頁面內容由 LocaleProvider 依「網址」建的 i18n instance 驅動，
    // 只呼叫 changeLanguage 只會換到外殼，內容不會跟著換
    const prefix = prefixOf(code);
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
      {/* 站台設定只開了一個語系就沒得切，整組不出現 */}
      {enabledLocales().length > 1 && (
        <fieldset className="snav-util-group">
          <legend className="sr-only">{t('siteNav.language')}</legend>
          {enabledLocales().map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={code === current ? 'is-on' : undefined}
              aria-current={code === current ? 'true' : undefined}
              onPointerEnter={() => void loadLocale(code)}
              onFocus={() => void loadLocale(code)}
              onClick={() => void switchLocale(code)}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </fieldset>
      )}
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
      className={`snav${isHome ? ' is-home' : ''}${slim ? ' is-slim' : ''}${folded ? ' is-folded' : ''}${moreOpen ? ' is-more' : ''}${skySide ? ' is-sky' : ''}${menuOpen ? ' is-menu' : ''}`}
      onPointerEnter={onNavEnter}
      onPointerLeave={onNavLeave}
    >
      <div className="snav-bar">
        {/* 站名與它的天空：天體（換主題）不是一個頁面，不排進右邊那一排，跟站名放在一起。
            畫的是現在這顆的縮小版（layout/ThemeMenu），旁邊是它的名字 */}
        <div className="snav-id">
          <LocaleLink to="/" className="snav-name" aria-label={t('siteNav.home')}>
            {author}
          </LocaleLink>
          <button
            type="button"
            className="snav-sky"
            aria-label={`${t('siteNav.sky')} ${t(`siteNav.skyNames.${theme}`)}`}
            aria-expanded={open === 'sky'}
            aria-controls="snav-more"
            onMouseEnter={() => hoverMenu('sky')}
            onClick={() => {
              cancelIntent();
              if (open === 'sky' && performance.now() - openedAtRef.current > OPENING_MS) setOpen(null);
              else openMenu('sky');
            }}
          >
            <ThemeGlyph theme={theme} />
            <span className="snav-sky-name">{t(`siteNav.skyNames.${theme}`)}</span>
          </button>
        </div>

        <nav className="snav-links" aria-label={t('nav.menu')}>
          {/* onMouseLeave 只是讓琥珀點回到所在分區，純視覺；連結本身都在焦點序列裡 */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            ref={linksRef}
            className="snav-row"
            onMouseLeave={() => {
              moveDotTo(restIndex);
              if (!open) cancelIntent();
            }}
          >
            <span ref={dotRef} className="snav-dot" aria-hidden />
            {MAIN.map((it, i) => (
              <LocaleLink
                key={it.key}
                to={it.to}
                data-nav-item
                className={i === activeMain ? 'is-on' : undefined}
                aria-current={i === activeMain ? 'page' : undefined}
                onMouseEnter={() => {
                  moveDotTo(i);
                  hoverMenu(MENU_KEYS[i]);
                }}
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
              onMouseEnter={() => {
                moveDotTo(MAIN.length);
                hoverMenu('more');
              }}
              onFocus={() => moveDotTo(MAIN.length)}
              onClick={() => {
                // 點了就以點的為準：滑進來時排的「停一下就展開」不要在之後又把它打開
                cancelIntent();
                if (open === 'more' && performance.now() - openedAtRef.current > OPENING_MS) setOpen(null);
                else openMenu('more');
              }}
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
        {/* 每一區一頁疊在一起；高度跟著開著的那一頁變（量出來寫到 --deck-h） */}
        <div className="snav-deck" ref={deckRef}>
          <NavMenus
            open={open}
            was={was}
            dir={dir}
            armed={armed}
            label={label}
            more={
              <>
                <div className="snav-more-links">
                  {moreOn.map((it) => (
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
              </>
            }
          />
        </div>
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
          {[...aboutOn, ...moreOn].map((it) => (
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
        <SkyRow />
        {utilities}
      </div>
    </header>
  );
}
