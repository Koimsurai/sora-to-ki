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
import { Plus, Edit, Trash2, BookOpen, ExternalLink, Search, Loader2, Star, StarHalf } from 'lucide-react';
import { toast } from 'sonner';

export default function BooksManager() {
  const [books, setBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBook, setEditingBook] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [formData, setFormData] = useState({
    isbn: '',
    title: '',
    authors: '',
    publisher: '',
    published_date: '',
    description: '',
    cover_url: '',
    page_count: '',
    language: '',
    categories: '',
    reading_status: 'to-read',
    rating: null,
    personal_notes: '',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  useEffect(() => {
    fetchBooks();
  }, []);

  const filteredBooks = books.filter(book => {
    const query = localSearchQuery.toLowerCase();
    return (
      book.title.toLowerCase().includes(query) ||
      (book.authors && book.authors.toLowerCase().includes(query)) ||
      (book.isbn && book.isbn.toLowerCase().includes(query))
    );
  });

  const fetchBooks = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/books', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setBooks(data.books || data);
      }
    } catch (error) {
      console.error('獲取書籍失敗:', error);
      toast.error('獲取書籍失敗');
    } finally {
      setIsLoading(false);
    }
  };

  // 搜尋外部書籍 (Google Books API)
  const searchExternalBooks = async () => {
    if (!searchQuery.trim()) {
      toast.error('請輸入 ISBN 或書名');
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/books/search/external?query=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      
      if (data.message === 'success' && data.books) {
        setSearchResults(data.books);
        if (data.books.length === 0) {
          toast.info('未找到相關書籍');
        } else {
          toast.success(`找到 ${data.books.length} 本書籍`);
        }
      } else {
        toast.error('搜尋失敗');
      }
    } catch (error) {
      console.error('搜尋書籍失敗:', error);
      toast.error('搜尋失敗,請稍後再試');
    } finally {
      setIsSearching(false);
    }
  };

  // 從搜尋結果選擇書籍
  const handleSelectFromSearch = (book) => {
    setFormData({
      isbn: book.isbn || '',
      title: book.title || '',
      authors: book.authors || '',
      publisher: book.publisher || '',
      published_date: book.published_date || '',
      description: book.description || '',
      cover_url: book.cover_url || '',
      page_count: book.page_count || '',
      language: book.language || '',
      categories: book.categories || '',
      reading_status: 'to-read',
      rating: null,
      personal_notes: '',
    });
    setSearchResults([]);
    setSearchQuery('');
    toast.success('已自動填入書籍資訊');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('adminToken');
      const url = editingBook 
        ? `/api/books/${editingBook.id}`
        : '/api/books';
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
      isbn: book.isbn || '',
      title: book.title || '',
      authors: book.authors || '',
      publisher: book.publisher || '',
      published_date: book.published_date || '',
      description: book.description || '',
      cover_url: book.cover_url || '',
      page_count: book.page_count || '',
      language: book.language || '',
      categories: book.categories || '',
      reading_status: book.reading_status || 'to-read',
      rating: book.rating || null,
      personal_notes: book.personal_notes || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/books/${deleteId}`, {
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
      isbn: '',
      title: '',
      authors: '',
      publisher: '',
      published_date: '',
      description: '',
      cover_url: '',
      page_count: '',
      language: '',
      categories: '',
      reading_status: 'to-read',
      rating: null,
      personal_notes: '',
    });
    setEditingBook(null);
    setSearchResults([]);
    setSearchQuery('');
  };

  const statusLabels = {
    'to-read': '想讀',
    'reading': '閱讀中',
    'read': '已完成',
  };

  // 渲染星星評分
  const renderStars = (rating) => {
    const stars = [];
    const numRating = parseFloat(rating) || 0;

    for (let i = 1; i <= 5; i++) {
      if (numRating >= i) {
        stars.push(<Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />);
      } else if (numRating >= i - 0.5) {
        stars.push(<StarHalf key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="h-4 w-4 text-muted-foreground" />);
      }
    }
    return <div className="flex gap-0.5">{stars}</div>;
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">書籍管理</h1>
          <p className="text-muted-foreground">管理您的閱讀清單</p>
        </div>
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="篩選書庫內的書籍..."
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              新增書籍
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {editingBook ? '編輯書籍' : '新增書籍'}
              </DialogTitle>
              <DialogDescription>
                {editingBook ? '修改書籍資訊' : '從 ISBN 或書名搜尋,或手動輸入書籍資訊'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit}>
              {/* 內容滾動區域 */}
              <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-4">
                {/* ISBN/書名搜尋區塊 */}
                {!editingBook && (
              <div className="space-y-3 pb-4 border-b">
                <Label className="text-sm font-medium">📚 快速搜尋 (Google Books)</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), searchExternalBooks())}
                    placeholder="輸入 ISBN 或書名搜尋..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={searchExternalBooks}
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        搜尋中...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        搜尋
                      </>
                    )}
                  </Button>
                </div>

                {/* 搜尋結果 */}
                {searchResults.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto space-y-2 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-2">搜尋結果 ({searchResults.length}):</p>
                    {searchResults.map((book, index) => (
                      <div
                        key={index}
                        className="flex gap-3 p-3 bg-background rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handleSelectFromSearch(book)}
                      >
                        {book.cover_url && (
                          <img
                            src={book.cover_url}
                            alt={book.title}
                            className="w-12 h-16 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{book.title}</h4>
                          {book.authors && (
                            <p className="text-xs text-muted-foreground">{book.authors}</p>
                          )}
                          {book.isbn && (
                            <p className="text-xs text-muted-foreground">ISBN: {book.isbn}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

                {/* 表單內容 */}
                <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="isbn">ISBN</Label>
                    <Input
                      id="isbn"
                      value={formData.isbn}
                      onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                      placeholder="9789864060313"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">語言</Label>
                    <Input
                      id="language"
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                      placeholder="zh-TW"
                    />
                  </div>
                </div>

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
                  <Label htmlFor="authors">作者</Label>
                  <Input
                    id="authors"
                    value={formData.authors}
                    onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                    placeholder="詹姆斯·克利爾"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publisher">出版社</Label>
                    <Input
                      id="publisher"
                      value={formData.publisher}
                      onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                      placeholder="方智出版"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="published_date">出版日期</Label>
                    <Input
                      id="published_date"
                      type="date"
                      value={formData.published_date}
                      onChange={(e) => setFormData({ ...formData, published_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="page_count">頁數</Label>
                    <Input
                      id="page_count"
                      type="number"
                      value={formData.page_count}
                      onChange={(e) => setFormData({ ...formData, page_count: e.target.value })}
                      placeholder="320"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categories">分類</Label>
                    <Input
                      id="categories"
                      value={formData.categories}
                      onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
                      placeholder="自我成長"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cover_url">封面圖片網址</Label>
                  <Input
                    id="cover_url"
                    value={formData.cover_url}
                    onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
                    placeholder="https://example.com/cover.jpg"
                  />
                  {formData.cover_url && (
                    <div className="mt-2 rounded-lg overflow-hidden border max-w-[200px]">
                      <img src={formData.cover_url} alt="封面預覽" className="w-full h-auto" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">描述</Label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="書籍簡介..."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reading_status">閱讀狀態</Label>
                    <select
                      id="reading_status"
                      value={formData.reading_status}
                      onChange={(e) => setFormData({ ...formData, reading_status: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="to-read">想讀</option>
                      <option value="reading">閱讀中</option>
                      <option value="read">已完成</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rating">評分 (0-5)</Label>
                    <Input
                      id="rating"
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={formData.rating || ''}
                      onChange={(e) => setFormData({ ...formData, rating: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="5"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="personal_notes">個人筆記</Label>
                  <textarea
                    id="personal_notes"
                    value={formData.personal_notes}
                    onChange={(e) => setFormData({ ...formData, personal_notes: e.target.value })}
                    placeholder="分享您的閱讀心得和筆記..."
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
                </div>
              </div>
              {/* 關閉滾動區域 div */}
              
              <DialogFooter className="mt-4">
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

      {/* Books Grid - Clean Modern Style */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredBooks.map((book) => (
          <Card 
            key={book.id} 
            className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border-border/40 bg-card/80 backdrop-blur-md"
          >
            <CardContent className="p-0">
              {book.cover_url && (
                <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-muted/50 to-muted">
                  <img 
                    src={book.cover_url} 
                    alt={book.title}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                </div>
              )}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold line-clamp-2 text-base">
                    {book.title}
                  </h3>
                  {book.authors && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {book.authors}
                    </p>
                  )}
                  {book.publisher && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {book.publisher}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Badge 
                    variant="secondary" 
                    className="text-xs"
                  >
                    {statusLabels[book.reading_status] || book.reading_status}
                  </Badge>
                  {book.rating && renderStars(book.rating)}
                </div>

                {book.personal_notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2 italic">
                    "{book.personal_notes}"
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(book)}
                    className="flex-1"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    編輯
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(book.id)}
                    className="hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBooks.length === 0 && (
        <Card>
          <CardContent className="flex h-[200px] items-center justify-center">
            <div className="text-center text-muted-foreground">
              <BookOpen className="mx-auto h-12 w-12 opacity-20" />
              <p className="mt-4">{localSearchQuery ? '沒有找到符合條件的書籍' : '還沒有書籍'}</p>
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
