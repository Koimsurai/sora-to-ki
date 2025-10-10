import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Plus, Edit, Trash2, BookOpen, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function BooksManager() {
  const [books, setBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBook, setEditingBook] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    cover: '',
    link: '',
    status: 'reading',
    rating: 0,
    review: '',
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/books', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setBooks(data);
      }
    } catch (error) {
      console.error('獲取書籍失敗:', error);
      toast.error('獲取書籍失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('adminToken');
      const url = editingBook 
        ? `/api/admin/books/${editingBook.id}`
        : '/api/admin/books';
      const method = editingBook ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(editingBook ? '書籍已更新' : '書籍已新增');
        setDialogOpen(false);
        resetForm();
        fetchBooks();
      } else {
        toast.error('操作失敗');
      }
    } catch (error) {
      console.error('保存書籍失敗:', error);
      toast.error('保存失敗');
    }
  };

  const handleEdit = (book) => {
    setEditingBook(book);
    setFormData({
      title: book.title,
      author: book.author || '',
      cover: book.cover || '',
      link: book.link || '',
      status: book.status || 'reading',
      rating: book.rating || 0,
      review: book.review || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/books/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        toast.success('書籍已刪除');
        fetchBooks();
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除書籍失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      author: '',
      cover: '',
      link: '',
      status: 'reading',
      rating: 0,
      review: '',
    });
    setEditingBook(null);
  };

  const statusLabels = {
    reading: '閱讀中',
    completed: '已完成',
    wishlist: '想讀',
  };

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
          <h1 className="text-3xl font-bold tracking-tight">書籍管理</h1>
          <p className="text-muted-foreground">管理您的閱讀清單</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              新增書籍
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBook ? '編輯書籍' : '新增書籍'}</DialogTitle>
              <DialogDescription>
                {editingBook ? '修改書籍資訊' : '添加新的書籍到閱讀清單'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">書名 *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="原子習慣"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">作者</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    placeholder="詹姆斯·克利爾"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cover">封面圖片網址</Label>
                  <Input
                    id="cover"
                    value={formData.cover}
                    onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                    placeholder="https://example.com/cover.jpg"
                  />
                  {formData.cover && (
                    <div className="mt-2 rounded-lg overflow-hidden border max-w-[200px]">
                      <img src={formData.cover} alt="封面預覽" className="w-full h-auto" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link">連結</Label>
                  <Input
                    id="link"
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    placeholder="https://example.com/book"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">狀態</Label>
                    <select
                      id="status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="reading">閱讀中</option>
                      <option value="completed">已完成</option>
                      <option value="wishlist">想讀</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rating">評分 (0-5)</Label>
                    <Input
                      id="rating"
                      type="number"
                      min="0"
                      max="5"
                      step="0.5"
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="review">心得</Label>
                  <textarea
                    id="review"
                    value={formData.review}
                    onChange={(e) => setFormData({ ...formData, review: e.target.value })}
                    placeholder="分享您的閱讀心得..."
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">
                  {editingBook ? '更新' : '新增'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Books Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {books.map((book) => (
          <Card key={book.id} className="overflow-hidden">
            <CardContent className="p-0">
              {book.cover && (
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  <img 
                    src={book.cover} 
                    alt={book.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold line-clamp-2">{book.title}</h3>
                  {book.author && (
                    <p className="text-sm text-muted-foreground">{book.author}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {statusLabels[book.status] || book.status}
                  </Badge>
                  {book.rating > 0 && (
                    <span className="text-sm">⭐ {book.rating}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {book.link && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="flex-1"
                    >
                      <a href={book.link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        查看
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(book)}
                    className={book.link ? '' : 'flex-1'}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    編輯
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(book.id)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {books.length === 0 && (
        <Card>
          <CardContent className="flex h-[200px] items-center justify-center">
            <div className="text-center text-muted-foreground">
              <BookOpen className="mx-auto h-12 w-12 opacity-20" />
              <p className="mt-4">還沒有書籍</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這本書嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原。書籍將被永久刪除。
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
