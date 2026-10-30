// 草稿的前台預覽（/preview/post）：後台編輯器按「在前台預覽」開的分頁。
//
// 用的是讀者看到的那一頁（blog/BlogPost），資料換成編輯器交過來的內容（store/postPreview），
// 還沒存的也算；編輯器一改這裡就跟著重畫。MDX 與 mermaid 照前台的做法在伺服器端編。
//
// 只有登入的管理者看得到：草稿 API 對訪客是不存在的（後端擋），這一頁也一樣，
// 而內容本來就只在作者這台電腦的瀏覽器裡（localStorage＋BroadcastChannel）。
import { useEffect, useMemo, useState } from 'react';
import BlogPost from '@/components/blog/BlogPost';
import NotFound from '@/components/layout/NotFound';
import { useAuth } from '@/contexts/auth';
import { adminReady, loadAdminI18n, useAdminT } from '@/i18n/admin-i18n';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import type { Locale } from '@/lib/locales';
import { siteName } from '@/lib/siteIdentity';
import { compileMarkdown, compileMdx } from '@/lib/mdx/mdx-compile';
import { renderMermaidSvgs } from '@/lib/mdx/mermaidRender';
import { buildPreviewDetail } from '@/lib/postPreviewDetail';
import { readPostPreview, subscribePostPreview, type PostPreviewSnapshot } from '@/store/postPreview';
import './DraftPreview.css';

/** 打字停多久才重新編譯（跟後台編輯器裡的預覽一樣） */
const COMPILE_DEBOUNCE_MS = 400;

interface Rendered {
  /** 是哪一份內文編出來的 */
  src: string;
  compiledMdx?: string;
  mermaidSvgs?: Record<string, string>;
  /** MDX 編不過：前台會靜靜退回純 Markdown，預覽要講出來 */
  error?: string;
}

export default function DraftPreview() {
  const { user, isLoggedIn, loading } = useAuth();
  const allowed = isLoggedIn && (user?.role === 'ADMIN' || user?.role === 'OWNER');
  // 這一頁不在 /admin 底下，後台的字串檔沒有跟著路由先載好：自己載，載好之前徽章先不寫字
  const { t } = useAdminT();
  const [i18nReady, setI18nReady] = useState(adminReady);
  useEffect(() => {
    if (!i18nReady) void loadAdminI18n().then(() => setI18nReady(true));
  }, [i18nReady]);
  // 分頁標題：路由的 head() 在伺服器上寫的是繁中（那時還不知道站長用哪個語言），字串到了再換
  useEffect(() => {
    if (i18nReady) document.title = t('editor.draft.pageTitle', { site: siteName() });
  }, [i18nReady, t]);
  const [snap, setSnap] = useState<PostPreviewSnapshot | null>(() => readPostPreview());
  useEffect(() => subscribePostPreview(setSnap), []);
  const [picked, setPicked] = useState<string | null>(null);
  const locale = picked ?? snap?.source_language ?? 'zh-TW';
  const content = snap ? ((snap.texts[locale] ?? snap.texts[snap.source_language])?.content ?? '') : '';
  const isMdx = snap?.format === 'mdx';

  const [rendered, setRendered] = useState<Rendered | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // 兩種格式都在伺服器編成 hast（同前台文章頁，見 data/blogList）
      const mdx = (isMdx ? compileMdx : compileMarkdown)({ data: content }).then(
        (code) => ({ code, error: undefined }),
        (e: unknown) => ({ code: undefined, error: e instanceof Error ? e.message : String(e) }),
      );
      const mermaid = renderMermaidSvgs({ data: content }).catch(() => ({}));
      void Promise.all([mdx, mermaid]).then(([m, mermaidSvgs]) => {
        if (!cancelled) setRendered({ src: content, compiledMdx: m.code, mermaidSvgs, error: m.error });
      });
    }, COMPILE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, isMdx]);

  // 新的還在編的時候先用上一份（打字時畫面不會閃回原始碼）
  const data = useMemo(
    () =>
      snap && rendered
        ? buildPreviewDetail(snap, locale, { compiledMdx: rendered.compiledMdx, mermaidSvgs: rendered.mermaidSvgs })
        : null,
    [snap, locale, rendered],
  );

  if (loading) return null;
  if (!allowed) return <NotFound />;

  return (
    <>
      {data ? (
        <LocaleProvider locale={locale as Locale}>
          <BlogPost preview={{ data, onLocale: setPicked }} />
        </LocaleProvider>
      ) : null}
      <output className="dp-badge">
        <span className="dp-dot" aria-hidden="true" />
        {!i18nReady
          ? null
          : !snap
            ? t('editor.draft.noSnapshot')
            : rendered?.error
              ? t('editor.draft.mdxFailed', { error: rendered.error })
              : t('editor.draft.badge')}
      </output>
    </>
  );
}
