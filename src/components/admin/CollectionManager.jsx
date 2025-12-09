import React, { useState, useEffect } from 'react';
import { Film, Tv, Plus, Edit, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
      const token = localStorage.getItem('adminToken');
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
      const token = localStorage.getItem('adminToken');
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
      const token = localStorage.getItem('adminToken');
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
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            className={star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">收藏館管理</h1>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setFormData(prev => ({ ...prev, collection_type: collectionType })); }}>
              <Plus className="mr-2 h-4 w-4" />
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

      <Tabs value={collectionType} onValueChange={setCollectionType}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="cinema">
            <Film className="mr-2 h-4 w-4" />
            電影院
          </TabsTrigger>
          <TabsTrigger value="anime">
            <Tv className="mr-2 h-4 w-4" />
            動漫閣
          </TabsTrigger>
        </TabsList>

        <TabsContent value={collectionType} className="space-y-4 mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="text-muted-foreground">載入中...</div>
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  {item.poster_url && (
                    <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                      <img
                        src={item.poster_url}
                        alt={item.title}
                        className="object-cover w-full h-full"
                      />
                      {item.is_favorite === 1 && (
                        <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                          <Star size={12} className="fill-current" />
                          精選
                        </div>
                      )}
                    </div>
                  )}
                  <CardContent className="p-4">
                    <h3 className="font-bold text-lg mb-1 line-clamp-1">{item.title}</h3>
                    {item.original_title && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-1">{item.original_title}</p>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      {item.year && <span className="text-xs bg-muted px-2 py-1 rounded">{item.year}</span>}
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {item.status === 'watching' ? '追番中' : '已完成'}
                      </span>
                    </div>
                    <div className="mb-3">
                      {renderStars(item.rating)}
                    </div>
                    {item.review && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.review}</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                {collectionType === 'cinema' ? <Film className="h-16 w-16 text-muted-foreground mb-4" /> : <Tv className="h-16 w-16 text-muted-foreground mb-4" />}
                <h3 className="text-lg font-semibold mb-2">還沒有{collectionType === 'cinema' ? '電影' : '動漫'}收藏</h3>
                <p className="text-muted-foreground mb-4">開始添加您的第一個{collectionType === 'cinema' ? '電影' : '動漫'}吧！</p>
                <Button onClick={() => { resetForm(); setFormData(prev => ({ ...prev, collection_type: collectionType })); setShowAddDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增{collectionType === 'cinema' ? '電影' : '動漫'}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
