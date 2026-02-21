import React, { useState, useEffect } from 'react';
import { Film, Tv, Plus, Pencil, Trash2, Star, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

const CollectionManager = () => {
  const [collectionType, setCollectionType] = useState('cinema');
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    original_title: '',
    year: '',
    poster_url: '',
    overview: '',
    external_id: '',
    collection_type: 'cinema',
    media_format: 'movie',
    status: 'completed',
    rating: 0,
    review: '',
    is_favorite: false,
    watch_date: ''
  });

  useEffect(() => {
    fetchCollectionItems();
  }, [collectionType]);

  const fetchCollectionItems = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/collection/${collectionType}`);
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('獲取收藏項目失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const response = await fetch('/api/collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          collection_type: collectionType,
          is_favorite: formData.is_favorite ? 1 : 0
        })
      });

      if (response.ok) {
        alert('收藏項目已新增！');
        setShowAddDialog(false);
        resetForm();
        fetchCollectionItems();
      } else {
        const error = await response.json();
        alert(`新增失敗: ${error.error}`);
      }
    } catch (error) {
      console.error('新增收藏項目失敗:', error);
      alert('新增失敗！');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const response = await fetch(`/api/collection/${selectedItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          is_favorite: formData.is_favorite ? 1 : 0
        })
      });

      if (response.ok) {
        alert('收藏項目已更新！');
        setShowEditDialog(false);
        setSelectedItem(null);
        resetForm();
        fetchCollectionItems();
      } else {
        const error = await response.json();
        alert(`更新失敗: ${error.error}`);
      }
    } catch (error) {
      console.error('更新收藏項目失敗:', error);
      alert('更新失敗！');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除這個收藏項目嗎？')) return;

    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const response = await fetch(`/api/collection/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('收藏項目已刪除！');
        fetchCollectionItems();
      } else {
        alert('刪除失敗！');
      }
    } catch (error) {
      console.error('刪除收藏項目失敗:', error);
      alert('刪除失敗！');
    }
  };

  const openEditDialog = (item) => {
    setSelectedItem(item);
    setFormData({
      title: item.title || '',
      original_title: item.original_title || '',
      year: item.year || '',
      poster_url: item.poster_url || '',
      overview: item.overview || '',
      external_id: item.external_id || '',
      collection_type: item.collection_type || collectionType,
      media_format: item.media_format || 'movie',
      status: item.status || 'completed',
      rating: item.rating || 0,
      review: item.review || '',
      is_favorite: item.is_favorite === 1,
      watch_date: item.watch_date || ''
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      original_title: '',
      year: '',
      poster_url: '',
      overview: '',
      external_id: '',
      collection_type: 'cinema',
      media_format: 'movie',
      status: 'completed',
      rating: 0,
      review: '',
      is_favorite: false,
      watch_date: ''
    });
  };

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={12}
            className={star <= rating ? 'text-foreground/50 fill-foreground/50' : 'text-muted-foreground/20'}
          />
        ))}
      </div>
    );
  };

  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      item.original_title?.toLowerCase().includes(q)
    );
  });

  const statusLabels = {
    'completed': '已完成',
    'watching': '追番中',
    'plan_to_watch': '計劃觀看',
  };

  const statusConfig = {
    'completed': 'text-foreground/50 bg-accent/50',
    'watching': 'text-foreground/70 bg-accent/60',
    'plan_to_watch': 'text-muted-foreground/60 bg-accent/25',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-foreground/90">收藏站管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理電影與動漫收藏</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 border-border/50 text-foreground/70 hover:bg-accent/40" onClick={() => { resetForm(); setFormData(prev => ({ ...prev, collection_type: collectionType })); }}>
              <Plus className="size-3.5" />
              新增{collectionType === 'cinema' ? '電影' : '動漫'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新增{collectionType === 'cinema' ? '電影' : '動漫'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">標題 *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="original_title">原始標題</Label>
                  <Input
                    id="original_title"
                    value={formData.original_title}
                    onChange={(e) => setFormData({...formData, original_title: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">年份</Label>
                  <Input
                    id="year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="media_format">類型</Label>
                  <Select value={formData.media_format} onValueChange={(value) => setFormData({...formData, media_format: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {collectionType === 'cinema' ? (
                        <>
                          <SelectItem value="movie">電影</SelectItem>
                          <SelectItem value="tv_show">電視劇</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="tv">動畫</SelectItem>
                          <SelectItem value="movie">劇場版</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="poster_url">海報 URL</Label>
                <Input
                  id="poster_url"
                  type="url"
                  value={formData.poster_url}
                  onChange={(e) => setFormData({...formData, poster_url: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="overview">簡介</Label>
                <Textarea
                  id="overview"
                  value={formData.overview}
                  onChange={(e) => setFormData({...formData, overview: e.target.value})}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">狀態</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed">已完成</SelectItem>
                      <SelectItem value="watching">追番中</SelectItem>
                      <SelectItem value="plan_to_watch">計劃觀看</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="watch_date">觀看日期</Label>
                  <Input
                    id="watch_date"
                    type="date"
                    value={formData.watch_date}
                    onChange={(e) => setFormData({...formData, watch_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rating">我的評分</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={24}
                      className={`cursor-pointer ${star <= formData.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                      onClick={() => setFormData({...formData, rating: star})}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review">我的心得</Label>
                <Textarea
                  id="review"
                  value={formData.review}
                  onChange={(e) => setFormData({...formData, review: e.target.value})}
                  rows={4}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_favorite"
                  checked={formData.is_favorite}
                  onCheckedChange={(checked) => setFormData({...formData, is_favorite: checked})}
                />
                <Label htmlFor="is_favorite">設為精選</Label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                  取消
                </Button>
                <Button type="submit">新增</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1">
        {[{ key: 'cinema', label: '電影院', icon: Film }, { key: 'anime', label: '動漫閣', icon: Tv }].map(tab => (
          <button
            key={tab.key}
            onClick={() => setCollectionType(tab.key)}
            className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg transition-colors ${
              collectionType === tab.key
                ? 'bg-accent/60 text-foreground/80'
                : 'text-muted-foreground/60 hover:text-foreground/60 hover:bg-accent/25'
            }`}
          >
            <tab.icon className="size-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="搜尋收藏..."
        className="bg-accent/20 border-border/40 text-foreground/80 text-sm h-9 placeholder:text-muted-foreground/40"
      />

      {/* Collection list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-muted-foreground/50 text-sm">載入中...</div>
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <div key={item.id} className="glass rounded-xl px-4 py-3.5 group hover:border-border/60 transition-all">
              <div className="flex items-start gap-3">
                {item.poster_url ? (
                  <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0">
                    <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="size-10 rounded-lg bg-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                    {collectionType === 'cinema' ? <Film className="size-4 text-muted-foreground/60" /> : <Tv className="size-4 text-muted-foreground/60" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-foreground/80 truncate">{item.title}</span>
                    {item.is_favorite === 1 && <Star className="size-3 text-foreground/40 fill-foreground/40 shrink-0" />}
                  </div>
                  {item.original_title && (
                    <p className="text-[11px] text-muted-foreground/40 truncate mb-1">{item.original_title}</p>
                  )}
                  <div className="flex items-center gap-2 mb-1.5">
                    {item.year && <span className="text-[10px] text-muted-foreground/40">{item.year}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusConfig[item.status] || 'bg-accent/25 text-muted-foreground/60'}`}>
                      {statusLabels[item.status] || item.status}
                    </span>
                  </div>
                  {item.rating > 0 && (
                    <div className="mb-1">{renderStars(item.rating)}</div>
                  )}
                  {item.review && (
                    <p className="text-[12px] text-muted-foreground/60 leading-relaxed line-clamp-2">{item.review}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => openEditDialog(item)}
                    className="size-6 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-foreground/60 hover:bg-accent/40 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="size-6 flex items-center justify-center rounded-md text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground/50">
          {collectionType === 'cinema' ? <Film className="size-12 opacity-20" /> : <Tv className="size-12 opacity-20" />}
          <p className="mt-4 text-sm">還沒有{collectionType === 'cinema' ? '電影' : '動漫'}收藏</p>
        </div>
      )}

      {/* 編輯 Dialog (類似新增,省略部分代碼) */}
      {showEditDialog && selectedItem && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>編輯{collectionType === 'cinema' ? '電影' : '動漫'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4">
              {/* 表單內容與新增相同,省略 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">標題 *</Label>
                  <Input
                    id="edit-title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-original_title">原始標題</Label>
                  <Input
                    id="edit-original_title"
                    value={formData.original_title}
                    onChange={(e) => setFormData({...formData, original_title: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                  取消
                </Button>
                <Button type="submit">更新</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default CollectionManager;
