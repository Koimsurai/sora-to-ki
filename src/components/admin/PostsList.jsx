import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  Search,
  Filter
} from 'lucide-react';
import { DataTable } from './table/DataTable';
import { DataTableColumnHeader } from './table/DataTableColumnHeader';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-tw';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

dayjs.locale('zh-tw');

export default function PostsList() {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/posts', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || data || []);
      }
    } catch (error) {
      console.error('獲取文章列表失敗:', error);
      toast.error('獲取文章列表失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/posts/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        toast.success('文章已刪除');
        fetchPosts();
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除文章失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
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
      accessorKey: 'category',
      header: '分類',
      cell: ({ row }) => {
        const category = row.getValue('category');
        return category ? (
          <Badge variant="outline">{category}</Badge>
        ) : (
          <span className="text-muted-foreground">未分類</span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: '狀態',
      cell: ({ row }) => {
        const status = row.getValue('status');
        const variants = {
          published: 'default',
          draft: 'secondary',
          archived: 'outline'
        };
        const labels = {
          published: '已發佈',
          draft: '草稿',
          archived: '已封存'
        };
        return (
          <Badge variant={variants[status] || 'secondary'}>
            {labels[status] || status}
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
      header: '操作',
      cell: ({ row }) => {
        const post = row.original;
        return (
          <div className="flex items-center gap-2">
            {post.slug && (
              <Button variant="ghost" size="icon" asChild title="預覽">
                <Link to={`/blog/${post.slug}`} target="_blank">
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" asChild title="編輯">
              <Link to={`/admin/posts/edit/${post.id}`}>
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setDeleteId(post.id)}
              title="刪除"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
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
          <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
          <p className="text-muted-foreground">管理您的所有文章內容</p>
        </div>
        <Button asChild>
          <Link to="/admin/posts/create">
            <Plus className="mr-2 h-4 w-4" />
            新增文章
          </Link>
        </Button>
      </div>

      {/* Posts Table */}
      <Card>
        <CardContent className="pt-6">
          {posts.length > 0 ? (
            <DataTable
              columns={columns}
              data={posts}
              searchKey="title"
              searchPlaceholder="搜尋文章標題..."
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Search className="mx-auto h-12 w-12 opacity-20" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這篇文章嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原。文章將被永久刪除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
