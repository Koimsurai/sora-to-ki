// 導覽列的選單（layout/SiteNav）：滑到一個分區上等一下就往下展開，開著的時候滑到別的分區直接換頁。
//
// 每一頁同一個格式：左邊是那一區的副標（作者自己寫的那一句）與「全部 →」，右邊是那一區此刻的東西——
//   手記：最新 4 篇　碎念：最新 3 則　作品：最近動過的 3 件　收藏：在看、在讀、在聽
//   關於：名字與聯絡方式、跟「我」有關的頁　更多：照片、朋友、此站點，與搜尋、語言、帳號
// 正在發生的那一件（正在看的、正在放的歌、最近推過的作品）前面一顆琥珀點，跟導覽列那顆是同一種東西。
// 資料只在第一次打開選單之後才抓（armed），沒碰導覽列的訪客一個請求都不會多。
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa';
import { recentPostsQueryOptions } from '@/data/blogList';
import { booksQueryOptions } from '@/data/bookshelfData';
import { nowPlayingQueryOptions, recentlyPlayedQueryOptions } from '@/data/musicData';
import { ABOUT_SECTIONS, type SiteSection } from '@/data/siteSections';
import { useEnabledSections, useSiteConfig } from '@/data/siteConfig';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { latestAnimeQueryOptions, liveNowQueryOptions } from '@/data/watchData';
import { statsOf, useWorkEntries, useWorkStats } from '@/data/works';
import { pickText } from '@/lib/i18nText';
import { useLocale } from '@/hooks/useLocale';
import { LocaleLink } from '@/i18n/locale-link';
import { splitTitle } from '@/lib/blogReading';
import { postPath } from '@/lib/postPath';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { thoughtLine } from '@/lib/thoughtRef';

export type MenuKey = 'notes' | 'moments' | 'works' | 'collection' | 'about' | 'more';

const short = (iso: string) => dotDate(parseServerDate(iso), true);

/** 一頁的骨架：左邊副標與「全部」，右邊清單 */
function Page({
  lead,
  all,
  children,
}: {
  lead: React.ReactNode;
  all?: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="snav-page-lead">
        {lead}
        {all && (
          <LocaleLink to={all.to} className="snav-page-all">
            {all.label} →
          </LocaleLink>
        )}
      </div>
      <ol className="snav-page-list">{children}</ol>
    </>
  );
}

function Row({
  to,
  href,
  live,
  stamp,
  title,
  note,
}: {
  to?: string;
  href?: string;
  /** 正在發生：前面一顆琥珀點 */
  live?: boolean;
  stamp?: React.ReactNode;
  title: React.ReactNode;
  note?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="snav-row-stamp">{stamp}</span>
      <span className="snav-row-title">{title}</span>
      {note && <span className="snav-row-note">{note}</span>}
    </>
  );
  return (
    <li className={live ? 'is-live' : undefined}>
      {to ? (
        <LocaleLink to={to}>{body}</LocaleLink>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      )}
    </li>
  );
}

function NotesPage({ armed }: { armed: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: posts = [] } = useQuery({ ...recentPostsQueryOptions(200, locale), enabled: armed });
  return (
    <Page
      lead={<p>{t('blog.subtitle')}</p>}
      all={{ to: '/blog', label: t('siteNav.allPosts', { count: posts.length }) }}
    >
      {posts.slice(0, 4).map((p) => (
        <Row key={p.id} to={postPath(p)} stamp={short(p.created_at)} title={splitTitle(p.title).main} />
      ))}
    </Page>
  );
}

function MomentsPage({ armed }: { armed: boolean }) {
  const { t } = useTranslation();
  const { data: thoughts = [] } = useQuery({ ...thoughtsListQueryOptions, enabled: armed });
  return (
    <Page lead={<p>{t('thinking.subtitle')}</p>} all={{ to: '/thinking', label: t('siteNav.allMoments') }}>
      {thoughts.slice(0, 3).map((th) => {
        const line = thoughtLine(th);
        return (
          <Row
            key={th.id}
            to={`/thinking/${th.id}`}
            stamp={short(th.created_at)}
            title={line.length > 34 ? `${line.slice(0, 34)}…` : line}
          />
        );
      })}
    </Page>
  );
}

function WorksPage({ armed }: { armed: boolean }) {
  const { t } = useTranslation();
  const locale = useLocale();
  // 選單展開了才抓；後端沒拿到的那幾件用最後量到的數據，跟作品頁同一個做法
  const entries = useWorkEntries(armed);
  const live = useWorkStats(entries, armed);
  const works = entries
    .map((w) => ({ ...w, pushed: statsOf(w, live).pushed_at }))
    .sort((a, b) => b.pushed.localeCompare(a.pushed))
    .slice(0, 3);
  return (
    <Page
      lead={<p>{t('works.subtitle')}</p>}
      all={{ to: '/portfolio', label: t('siteNav.allWorks', { count: entries.length }) }}
    >
      {works.map((w, i) => (
        <Row
          key={w.repo}
          to="/portfolio"
          live={i === 0}
          stamp={short(w.pushed)}
          title={w.name}
          note={pickText(w.what, locale)}
        />
      ))}
    </Page>
  );
}

function CollectionPage({ armed }: { armed: boolean }) {
  const { t } = useTranslation();
  const { data: watching } = useQuery({ ...liveNowQueryOptions, enabled: armed });
  const { data: latestAnime } = useQuery({ ...latestAnimeQueryOptions, enabled: armed });
  const { data: books = [] } = useQuery({ ...booksQueryOptions, enabled: armed });
  const { data: playing } = useQuery({ ...nowPlayingQueryOptions, enabled: armed });
  const { data: recent } = useQuery({ ...recentlyPlayedQueryOptions, enabled: armed });

  const reading = books.find((b) => b.reading_status === 'reading');
  const lastRead = [...books]
    .filter((b) => b.reading_status === 'read' && b.date_finished)
    .sort((a, b) => (b.date_finished ?? '').localeCompare(a.date_finished ?? ''))
    .at(0);
  const song = playing?.is_playing ? playing.item : (recent?.tracks?.[0]?.track ?? null);
  const songLine = song ? `${song.name} — ${song.artists.map((a) => a.name).join('、')}` : null;
  const recently = (s: string) => `${t('siteNav.recently')}　${s}`;

  return (
    <Page lead={<p>{t('collection.subtitle')}</p>}>
      <Row
        to="/watch"
        live={Boolean(watching)}
        stamp={t('siteNav.watching')}
        title={
          watching
            ? `${watching.title}${watching.episode ? `　${t('siteNav.episode', { ep: watching.episode })}` : ''}`
            : latestAnime?.title
              ? recently(latestAnime.title)
              : '—'
        }
        note="WATCH"
      />
      <Row
        to="/watch"
        live={Boolean(reading)}
        stamp={t('siteNav.reading')}
        title={reading ? `《${reading.title}》` : lastRead ? recently(`《${lastRead.title}》`) : '—'}
        note="READ"
      />
      <Row
        to="/watch"
        live={Boolean(playing?.is_playing)}
        stamp={t('siteNav.listening')}
        title={songLine ? (playing?.is_playing ? songLine : recently(songLine)) : '—'}
        note="LISTEN"
      />
    </Page>
  );
}

function AboutPage({ label }: { label: (it: SiteSection) => string }) {
  const { t } = useTranslation();
  const pages = useEnabledSections(ABOUT_SECTIONS);
  const { github, email } = useSiteConfig();
  return (
    <Page
      lead={
        <>
          <p>{t('siteNav.aboutLead')}</p>
          {(github || email) && (
            <p className="snav-page-contact">
              {github && (
                <a href={`https://github.com/${github}`} target="_blank" rel="noopener noreferrer">
                  <FaGithub aria-hidden="true" /> GitHub
                </a>
              )}
              {email && <a href={`mailto:${email}`}>Email</a>}
            </p>
          )}
        </>
      }
      all={{ to: '/about', label: t('siteNav.aboutAll') }}
    >
      {pages.map((it) => (
        <Row key={it.key} to={it.to} title={label(it)} note={it.caps} />
      ))}
    </Page>
  );
}

/**
 * 全部的頁疊在一起，只有開著的那一頁看得到；換頁時舊的往滑過去的反方向淡出、新的從那一側淡入。
 * 「更多」那一頁的內容由 SiteNav 給（它的連結與搜尋、語言、帳號原本就在那邊）。
 */
export default function NavMenus({
  open,
  was,
  dir,
  armed,
  more,
  label,
}: {
  open: MenuKey | null;
  /** 上一個開著的：往反方向退出去 */
  was: MenuKey | null;
  /** 換頁的方向：往右滑到下一個分區是 1，往左是 -1 */
  dir: number;
  armed: boolean;
  more: React.ReactNode;
  label: (it: SiteSection) => string;
}) {
  const pages: [MenuKey, React.ReactNode][] = [
    ['notes', <NotesPage key="notes" armed={armed} />],
    ['moments', <MomentsPage key="moments" armed={armed} />],
    ['works', <WorksPage key="works" armed={armed} />],
    ['collection', <CollectionPage key="collection" armed={armed} />],
    ['about', <AboutPage key="about" label={label} />],
    ['more', more],
  ];
  // 站台設定關掉的分區連選單都不畫（也就不會去抓它的資料）
  const off = useSiteConfig().disabled_pages;
  return (
    <>
      {pages
        .filter(([key]) => !off.includes(key))
        .map(([key, page]) => (
          <section
            key={key}
            className={`snav-page snav-page-${key}${open === key ? ' is-open' : was === key ? ' is-was' : ''}`}
            style={{ '--dir': dir } as React.CSSProperties}
            inert={open !== key}
            aria-hidden={open !== key}
          >
            {page}
          </section>
        ))}
    </>
  );
}
