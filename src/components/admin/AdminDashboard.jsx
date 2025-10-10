import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Users, MessageSquare, TrendingUp, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { DataTable } from './table/DataTable';
import { DataTableColumnHeader } from './table/DataTableColumnHeader';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';

dayjs.locale('zh-tw');

export const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalPosts: 0,
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
      const token = localStorage.getItem('adminToken');
      
      // Fetch posts
      const postsResponse = await fetch('/api/admin/posts?limit=5', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        setRecentPosts(postsData.posts || []);
        setStats(prev => ({ ...prev, totalPosts: postsData.totalPosts || postsData.posts?.length || 0 }));
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

  const columns = [
    {
      accessorKey: 'title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="標題" />,
      cell: ({ row }) => (
        <div className="max-w-[500px] truncate font-medium">
          {row.getValue('title')}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: '狀態',
      cell: ({ row }) => {
        const status = row.getValue('status');
        return (
          <Badge variant={status === 'published' ? 'default' : 'secondary'}>
            {status === 'published' ? '已發布' : '草稿'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="建立時間" />,
      cell: ({ row }) => {
        const date = dayjs(row.getValue('created_at'));
        return <time dateTime={date.toISOString()}>{date.format('YYYY-MM-DD HH:mm')}</time>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const post = row.original;
        return (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/blog/${post.id}`} target="_blank">
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/admin/edit/${post.id}`}>
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">儀表板</h1>
          <p className="text-muted-foreground">歡迎回到管理後台</p>
        </div>
        <Button asChild>
          <Link to="/admin/posts/create">
            <Plus className="mr-2 h-4 w-4" />
            新增文章
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總文章數</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPosts}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 text-green-500" /> +{Math.floor(stats.totalPosts * 0.1)} 本月
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">訪客統計</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.visitors || 1234}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 text-green-500" /> +12% 本週
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">留言總數</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.comments || 56}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 text-green-500" /> +{Math.floor((stats.comments || 56) * 0.05)} 本週
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成長率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{stats.growth || 23}%</div>
            <p className="text-xs text-muted-foreground">較上月成長</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Posts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>最新文章</CardTitle>
              <CardDescription>最近發布的文章列表</CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link to="/admin/posts">查看全部</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentPosts.length > 0 ? (
            <DataTable
              columns={columns}
              data={recentPosts}
              searchKey="title"
              searchPlaceholder="搜尋文章..."
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 opacity-20" />
                <p className="mt-4">還沒有文章</p>
                <Button className="mt-4" asChild>
                  <Link to="/admin/posts/create">
                    <Plus className="mr-2 h-4 w-4" />
                    創建第一篇文章
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
