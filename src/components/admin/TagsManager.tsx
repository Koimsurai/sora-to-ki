import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, X, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface TagItem {
  id: number;
  name: string;
  slug?: string;
  color?: string;
  post_count?: number;
}

interface TagForm {
  name: string;
  slug: string;
  color: string;
}

export default function TagsManager() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [formData, setFormData] = useState<TagForm>({
    name: '',
    slug: '',
    color: '#7f5af0',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    void fetchTags();
  }, []);

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedTags = [...filteredTags].sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0));

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const response = await fetch('/api/admin/tags', {
        headers: { 'Authorization': `Bearer ${token ?? ''}` },
      });

      if (response.ok) {
        const data = await response.json() as TagItem[];
        setTags(data);
      }
    } catch (error) {
      console.error('獲取標籤失敗:', error);
      toast.error('獲取標籤失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const url = editingTag
        ? `/api/admin/tags/${editingTag.id}`
        : '/api/admin/tags';
      const method = editingTag ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(editingTag ? '標籤已更新' : '標籤已創建');
        setDialogOpen(false);
        resetForm();
        void fetchTags();
      } else {
        toast.error('操作失敗');
      }
    } catch (error) {
      console.error('保存標籤失敗:', error);
      toast.error('保存失敗');
    }
  };

  const handleEdit = (tag: TagItem) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      slug: tag.slug ?? '',
      color: tag.color ?? '#7f5af0',
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const token = localStorage.getItem('koimsurai_user_token');
      const response = await fetch(`/api/admin/tags/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token ?? ''}` },
      });

      if (response.ok) {
        toast.success('標籤已刪除');
        void fetchTags();
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除標籤失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', slug: '', color: '#7f5af0' });
    setEditingTag(null);
  };

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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-foreground/90">標籤管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {tags.length} 個標籤
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 border-border/50 text-foreground/70 hover:bg-accent/40" onClick={resetForm}>
              <Plus className="size-3.5" />
              新增標籤
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTag ? '編輯標籤' : '新增標籤'}</DialogTitle>
              <DialogDescription>
                {editingTag ? '修改標籤資訊' : '創建新的文章標籤'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { void handleSubmit(e); }}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">標籤名稱</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="React"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL 別名</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="react"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">顏色</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="#7f5af0"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">
                  {editingTag ? '更新' : '創建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="搜尋標籤..."
        className="bg-accent/20 border-border/40 text-foreground/80 text-sm h-9 placeholder:text-muted-foreground/40"
      />

      {/* Tags cloud */}
      {sortedTags.length > 0 && (
        <div className="glass rounded-xl p-5">
          <div className="flex flex-wrap gap-2">
            {sortedTags.map((tag) => {
              const count = tag.post_count ?? 0;
              const sizeClass = count >= 10
                ? 'text-sm px-3 py-1.5'
                : count >= 5
                  ? 'text-[13px] px-2.5 py-1'
                  : 'text-[12px] px-2 py-0.5';

              return (
                <span
                  key={tag.id}
                  className={`group inline-flex items-center gap-1.5 rounded-lg border border-border/40 text-foreground/60 hover:text-foreground/80 hover:border-border/60 transition-colors cursor-default ${sizeClass}`}
                >
                  {tag.color && (
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  )}
                  <span>{tag.name}</span>
                  <span className="text-muted-foreground/40 text-[10px]">{count}</span>
                  <button
                    onClick={() => setDeleteId(tag.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tags table */}
      {sortedTags.length > 0 ? (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30">
            <h2 className="text-[13px] font-medium text-foreground/80">全部標籤</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/20 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">名稱</th>
                <th className="text-right px-4 py-2 font-medium">文章數</th>
                <th className="text-right px-4 py-2 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/15">
              {sortedTags.map((tag) => (
                <tr key={tag.id} className="group hover:bg-accent/15 transition-colors">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {tag.color && (
                        <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      )}
                      <span className="text-[13px] text-foreground/70 font-mono">{tag.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-[12px] text-muted-foreground/60">{tag.post_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(tag)}
                        className="text-[11px] text-muted-foreground hover:text-foreground/70 transition-all px-1.5 py-0.5 rounded hover:bg-accent/40"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => setDeleteId(tag.id)}
                        className="text-[11px] text-muted-foreground hover:text-destructive transition-all px-1.5 py-0.5 rounded hover:bg-destructive/10"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground/50">
          <Tag className="size-12 opacity-20" />
          <p className="mt-4 text-sm">還沒有標籤</p>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這個標籤嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原。標籤將被永久刪除，但不會影響已標記的文章。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
