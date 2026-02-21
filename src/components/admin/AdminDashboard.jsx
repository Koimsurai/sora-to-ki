import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Eye, MessageSquare, TrendingUp, Plus, Edit, Clock, ArrowUpRight } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';

dayjs.locale('zh-tw');

export const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalPosts: 0,
    publishedPosts: 0,
    draftPosts: 0,
    visitors: 0,
    comments: 0,
    growth: 0,
  });
  const [recentPosts, setRecentPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('koimsurai_user_token');
      
      // Fetch posts
      const postsResponse = await fetch('/api/admin/posts?limit=5', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        setRecentPosts(postsData.posts || []);
        setStats(prev => ({ ...prev, totalPosts: postsData.total || postsData.posts?.length || 0 }));
      }

      // Fetch stats
      const statsResponse = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(prev => ({ ...prev, ...statsData }));
      }
    } catch (error) {
      console.error('獲取數據失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const statItems = [
    { label: '文章總數', value: stats.totalPosts, icon: FileText, change: `+${stats.postsThisMonth || Math.floor(stats.totalPosts * 0.1)}` },
    { label: '本月瀏覽', value: stats.visitors || 1665, icon: Eye, change: '+12%' },
    { label: '留言數', value: stats.comments || 56, icon: MessageSquare, change: `+${stats.commentsThisWeek || Math.floor((stats.comments || 56) * 0.05)}` },
    { label: '成長率', value: `+${stats.growth || 23}%`, icon: TrendingUp, change: '較上月' },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-zinc-600 border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-foreground/90">儀表板</h1>
          <p className="text-sm text-muted-foreground mt-1">歡迎回來，這是你的部落格概覽。</p>
        </div>
        <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 border-border/50 text-foreground/70 hover:bg-accent/40" asChild>
          <Link to="/admin/posts/create">
            <Plus className="size-3.5" />
            新增文章
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statItems.map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-4 group">
            <div className="flex items-center justify-between mb-3">
              <stat.icon className="size-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-0.5">
                {stat.change}
                <ArrowUpRight className="size-3" />
              </span>
            </div>
            <div className="text-2xl font-semibold text-foreground/90 tracking-tight">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-5 gap-3">
        {/* Recent Posts */}
        <div className="lg:col-span-3 glass rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <h2 className="text-[13px] font-medium text-foreground/80">最近文章</h2>
            <Link to="/admin/posts" className="text-[11px] text-muted-foreground hover:text-foreground/70 transition-colors">查看全部</Link>
          </div>
          {recentPosts.length > 0 ? (
            <div className="divide-y divide-border/20">
              {recentPosts.map((post) => (
                <div key={post.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-foreground/80 truncate">{post.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground/60">{post.category || '未分類'}</span>
                      <span className="text-border/50">/</span>
                      <span className="text-[11px] text-muted-foreground/60">{dayjs(post.created_at).format('YYYY-MM-DD')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${post.status === 'published' ? 'text-foreground/60 bg-accent/40' : 'text-muted-foreground bg-accent/20'}`}>
                      {post.status === 'published' ? '已發佈' : '草稿'}
                    </span>
                    <Link
                      to={`/admin/posts/edit/${post.id}`}
                      className="size-6 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground/60 hover:bg-accent/40 transition-colors"
                    >
                      <Edit className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
              <FileText className="size-12 opacity-20" />
              <p className="mt-4 text-sm">還沒有文章</p>
              <Button className="mt-4" size="sm" asChild>
                <Link to="/admin/posts/create">
                  <Plus className="mr-2 size-3.5" />
                  創建第一篇文章
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Sidebar - Activity */}
        <div className="lg:col-span-2 space-y-3">
          {/* Quick Stats */}
          <div className="glass rounded-xl">
            <div className="px-4 py-3 border-b border-border/30">
              <h2 className="text-[13px] font-medium text-foreground/80">操作紀錄</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground/70">
                    <span className="font-medium">瀏覽統計</span>
                    {' - '}
                    <span className="text-muted-foreground">共 {stats.totalPosts} 篇文章</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground/50">
                    <Clock className="size-3" />
                    即時
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground/70">
                    <span className="font-medium">已發佈</span>
                    {' - '}
                    <span className="text-muted-foreground">{stats.publishedPosts || 0} 篇</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground/50">
                    <Clock className="size-3" />
                    即時
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground/70">
                    <span className="font-medium">草稿</span>
                    {' - '}
                    <span className="text-muted-foreground">{stats.draftPosts || 0} 篇待發佈</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground/50">
                    <Clock className="size-3" />
                    即時
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
