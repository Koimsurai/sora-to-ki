import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaBookOpen } from 'react-icons/fa';
import { MegaMenuPanel, MegaMenuColumn } from './MegaMenu';

/**
 * 手記 menu 內容（categories + recent posts hover-linked）
 *   左欄：分類列表（hover 高亮 + filter 右欄）
 *   右欄：最新 N 篇（隨 hover 的分類動態切換）
 */

function RecentPostRow({ post }) {
  const dateLabel = useMemo(() => {
    if (!post.created_at) return '';
    const d = new Date(post.created_at);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 1) return '今天';
    if (diffDays < 7) return `${diffDays} 天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} 個月前`;
    return `${Math.floor(diffDays / 365)} 年前`;
  }, [post.created_at]);

  return (
    <Link to={`/blog/${post.id}`} className="mega-menu-post" viewTransition>
      <div className="mega-menu-post-title">{post.title}</div>
      <div className="mega-menu-post-meta">
        {post.category && <span>{post.category}</span>}
        {post.category && dateLabel && <span className="mega-menu-post-meta-dot">·</span>}
        {dateLabel && <span>{dateLabel}</span>}
      </div>
    </Link>
  );
}

function BlogMenuContent() {
  const [categories, setCategories] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activeCat, setActiveCat] = useState(null); // null = 全部

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/categories').then((r) => r.json()).catch(() => null),
      fetch('/api/posts?limit=50').then((r) => r.json()).catch(() => null),
    ]).then(([catsRes, postsRes]) => {
      if (cancelled) return;
      const cats = Array.isArray(catsRes) ? catsRes : catsRes?.categories || [];
      const list = Array.isArray(postsRes) ? postsRes : postsRes?.posts || [];
      // 只顯示有文章的分類，避免空欄位佔版面
      setCategories(cats.filter((c) => (c.post_count ?? 0) > 0));
      setPosts(list.filter((p) => p.status === 'published' || !p.status));
    });
    return () => { cancelled = true; };
  }, []);

  const filteredPosts = useMemo(() => {
    if (!activeCat) return posts.slice(0, 5);
    return posts.filter((p) => p.category === activeCat).slice(0, 5);
  }, [posts, activeCat]);

  return (
    <MegaMenuPanel>
      <MegaMenuColumn title="分類">
        <Link
          to="/blog"
          className={`mega-menu-category ${activeCat === null ? 'mega-menu-category--active' : ''}`}
          onMouseEnter={() => setActiveCat(null)}
        >
          <span>全部文章</span>
          <span className="mega-menu-category-count">{posts.length}</span>
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`/blog?category=${encodeURIComponent(c.name)}`}
            className={`mega-menu-category ${activeCat === c.name ? 'mega-menu-category--active' : ''}`}
            onMouseEnter={() => setActiveCat(c.name)}
          >
            <span>{c.name}</span>
            <span className="mega-menu-category-count">{c.post_count ?? 0}</span>
          </Link>
        ))}
      </MegaMenuColumn>

      <MegaMenuColumn title={activeCat ? `${activeCat} · 最新` : '最新文章'} span={1}>
        <div className="mega-menu-posts">
          {filteredPosts.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'rgba(161,161,170,0.55)' }}>
              這個分類還沒有文章
            </div>
          )}
          {filteredPosts.map((p) => (
            <RecentPostRow key={p.id} post={p} />
          ))}
          <Link to="/blog" className="mega-menu-view-all">
            查看全部文章 →
          </Link>
        </div>
      </MegaMenuColumn>
    </MegaMenuPanel>
  );
}

export default BlogMenuContent;
