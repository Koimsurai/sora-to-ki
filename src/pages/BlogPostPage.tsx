import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { PostDetailResponse } from '@koimsurai/api-types';

// SSR fallback 用的文章形狀 = 後端生成的單篇回應（消手寫 interface，對齊 BlogPost 主型別）。
export type PostData = PostDetailResponse;

// 2e:文章頁(最小可 SSR 版)。loader 在 prerender 時依 locale 抓內容,這裡把 title + markdown 內文
// baked 進靜態 HTML(SEO)。mermaid / 程式碼複製等互動之後用 <ClientOnly> 補(沿用真正的 BlogPost)。
export function BlogPostPage({ post }: { post: PostData }) {
  return (
    <article style={{ fontFamily: 'sans-serif', maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <h1 data-testid="post-title">{post.title}</h1>
      <p style={{ color: '#888', fontSize: 14 }}>
        <span data-testid="post-locale">{post.locale}</span>
        {post.category ? ` · ${post.category}` : ''}
        {post.created_at ? ` · ${post.created_at.slice(0, 10)}` : ''}
      </p>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
    </article>
  );
}
