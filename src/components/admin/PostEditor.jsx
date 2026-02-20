'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postSchema } from '@/schemas/post';
import { MonacoEditor } from '@/components/monaco-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  Save,
  Send,
  Eye,
  Clock,
  Folder,
  ImageIcon,
  ArrowLeft,
  X,
  Sparkles,
  Loader2,
  LayoutTemplate,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams } from 'react-router-dom';

/**
 * v0 風格標籤搜尋選擇器
 */
function TagSearchInput({ tags, selectedTags, onChange }) {
  const [tagSearch, setTagSearch] = useState('');
  const selectedValues = new Set(selectedTags.map(t => t.value));
  const filteredTags = tags.filter(
    t => !selectedValues.has(t.value) && t.label.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const addTag = (tag) => {
    onChange([...selectedTags, tag]);
    setTagSearch('');
  };

  return (
    <div className="relative">
      <Input
        placeholder="搜尋標籤..."
        value={tagSearch}
        onChange={(e) => setTagSearch(e.target.value)}
        className="bg-accent/30 border-border/50 text-foreground/80 text-xs h-8 placeholder:text-muted-foreground/40"
      />
      {tagSearch && filteredTags.length > 0 && (
        <div className="absolute left-0 right-0 mt-1.5 max-h-28 overflow-y-auto rounded-lg border border-border/40 bg-popover/95 backdrop-blur-sm p-1 z-50">
          {filteredTags.map((tag) => (
            <button
              key={tag.value}
              type="button"
              onClick={() => addTag(tag)}
              className="w-full text-left text-xs px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}
      {tagSearch && filteredTags.length === 0 && (
        <div className="absolute left-0 right-0 mt-1.5 rounded-lg border border-border/40 bg-popover/95 backdrop-blur-sm p-3 z-50">
          <p className="text-center text-xs text-muted-foreground/60">沒有找到相關標籤</p>
        </div>
      )}
    </div>
  );
}

export default function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [isLoading, setIsLoading] = useState(!!id);

  const form = useForm({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: '',
      content: '',
      slug: '',
      summary: '',
      category: '',
      tags: [],
      cover: '',
      status: 'draft',
      layout_type: 'record',
      allowComments: true,
      pin: false,
      pinOrder: 0,
    },
  });

  // 載入文章數據（如果是編輯模式）
  useEffect(() => {
    if (id) {
      fetchPost();
    }
  }, [id]);

  // 從 URL 參數載入 N8N 自動匯入的資料
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const n8nData = urlParams.get('n8n_data');
    
    if (n8nData && !id) {
      try {
        const parsedData = JSON.parse(decodeURIComponent(n8nData));
        handleN8NImport(parsedData);
      } catch (error) {
        console.error('解析 N8N 資料失敗:', error);
        toast.error('匯入資料格式錯誤');
      }
    }
  }, []);

  // 載入分類和標籤
  useEffect(() => {
    fetchCategories();
    fetchTags();
  }, []);

  const fetchPost = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/posts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        // 確保 tags 格式正確，並將 API 的 excerpt 映射到表單的 summary
        const formattedData = {
          ...data,
          tags: formatTags(data.tags),
          summary: data.excerpt || data.summary || '',
        };
        form.reset(formattedData);
      } else {
        // API 不存在時使用模擬數據進行測試
        console.warn('API 未連接，使用模擬數據');
        const mockData = {
          id: id,
          title: '測試文章標題',
          content: '# 這是測試內容\n\n這是一段測試內容，用於展示編輯器功能。\n\n## 副標題\n\n- 列表項目 1\n- 列表項目 2\n- 列表項目 3\n\n```javascript\nconsole.log("Hello World");\n```',
          tags: [{label: 'React', value: 'react'}, {label: 'TypeScript', value: 'typescript'}],
          category: 'tech',
          slug: 'test-article',
          summary: '這是測試文章的摘要',
          cover: '',
          status: 'draft',
          allowComments: true,
          pin: false,
          pinOrder: 0,
        };
        form.reset(mockData);
        toast.info('使用模擬數據（API 未連接）');
      }
    } catch (error) {
      console.error('載入文章失敗:', error);
      // 即使出錯也使用模擬數據
      const mockData = {
        id: id,
        title: '測試文章標題',
        content: '# 這是測試內容\n\n編輯器已就緒，請開始編寫您的文章...',
        tags: [],
        category: '',
        slug: '',
        summary: '',
        cover: '',
        status: 'draft',
        allowComments: true,
        pin: false,
        pinOrder: 0,
      };
      form.reset(mockData);
      toast.warning('API 連接失敗，使用模擬數據');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 處理 N8N 自動匯入的資料
   */
  const handleN8NImport = (n8nData) => {
    // 驗證必填欄位
    if (!n8nData.title || !n8nData.content) {
      toast.error('N8N 資料缺少必填欄位 (title 或 content)');
      return;
    }

    // 轉換標籤格式
    const formattedTags = formatTags(n8nData.tags);

    // 自動生成 slug（如果沒有）
    const slug = n8nData.slug || generateSlugFromTitle(n8nData.title);

    // 提取摘要（如果沒有）
    const summary = n8nData.summary || extractSummary(n8nData.content);

    // 填充表單
    form.reset({
      title: n8nData.title,
      content: n8nData.content,
      tags: formattedTags,
      category: n8nData.category || '',
      slug: slug,
      summary: summary,
      cover: n8nData.cover || '',
      status: n8nData.status || 'draft',
      layout_type: n8nData.layout_type || 'record',
      allowComments: n8nData.allowComments !== false,
      pin: n8nData.pin || false,
      pinOrder: n8nData.pinOrder || 0,
    });

    toast.success('已成功匯入 N8N 資料');
  };

  /**
   * 格式化標籤數據
   * 支援多種輸入格式：
   * 1. 字串陣列: ["React", "TypeScript"]
   * 2. 物件陣列: [{label: "React", value: "1"}]
   * 3. 混合格式
   */
  const formatTags = (tags) => {
    if (!tags || !Array.isArray(tags)) {
      return [];
    }

    return tags.map((tag, index) => {
      // 如果是字串，轉換為物件格式
      if (typeof tag === 'string') {
        return {
          label: tag,
          value: tag.toLowerCase().replace(/\s+/g, '-'),
        };
      }
      // 如果已經是物件，確保有 label 和 value
      if (tag && typeof tag === 'object') {
        return {
          label: tag.label || tag.name || `Tag ${index + 1}`,
          value: tag.value || tag.id?.toString() || `tag-${index}`,
        };
      }
      // 預設值
      return {
        label: `Tag ${index + 1}`,
        value: `tag-${index}`,
      };
    });
  };

  /**
   * 從標題生成 slug
   */
  const generateSlugFromTitle = (title) => {
    if (!title) return '';
    
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  /**
   * 從內容提取摘要
   */
  const extractSummary = (content, maxLength = 150) => {
    if (!content) return '';
    
    const plainText = content
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*|\*|__|_/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/>\s/g, '')
      .replace(/[-*+]\s/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    return plainText.length > maxLength 
      ? plainText.substring(0, maxLength) + '...'
      : plainText;
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('載入分類失敗:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/tags', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ 載入標籤數據:', data);
        const formattedTags = data.map(tag => ({ 
          label: tag.name, 
          value: tag.id.toString() 
        }));
        console.log('✅ 格式化後的標籤:', formattedTags);
        setTags(formattedTags);
      } else {
        console.error('❌ 載入標籤失敗，狀態碼:', response.status);
        toast.error('載入標籤失敗');
      }
    } catch (error) {
      console.error('❌ 載入標籤異常:', error);
      toast.error('載入標籤失敗');
    }
  };

  const onSaveDraft = async (data) => {
    setIsSavingDraft(true);
    try {
      const token = localStorage.getItem('adminToken');
      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      
      // 轉換 tags 格式：從 [{label, value}] 轉為 ['tagName']
      const tagsArray = Array.isArray(data.tags) 
        ? data.tags.map(tag => typeof tag === 'string' ? tag : tag.label)
        : [];
      
      // 將表單的 summary 對應到 API 的 excerpt 欄位
      const { summary, ...rest } = data;
      const payload = { ...rest, excerpt: summary, tags: tagsArray, status: 'draft' };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success('草稿已儲存');
        const result = await response.json();
        if (!id && result.id) {
          navigate(`/admin/posts/edit/${result.id}`);
        }
      } else {
        toast.error('儲存失敗');
      }
    } catch (error) {
      console.error('儲存失敗:', error);
      toast.error('儲存失敗');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const onPublish = async (data) => {
    setIsPublishing(true);
    try {
      const token = localStorage.getItem('adminToken');
      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      
      // 轉換 tags 格式：從 [{label, value}] 轉為 ['tagName']
      const tagsArray = Array.isArray(data.tags) 
        ? data.tags.map(tag => typeof tag === 'string' ? tag : tag.label)
        : [];
      
      // 將表單的 summary 對應到 API 的 excerpt 欄位
      const { summary, ...rest } = data;
      const payload = { ...rest, excerpt: summary, tags: tagsArray, status: 'published' };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success('文章已發佈');
        navigate('/admin/posts');
      } else {
        toast.error('發佈失敗');
      }
    } catch (error) {
      console.error('發佈失敗:', error);
      toast.error('發佈失敗');
    } finally {
      setIsPublishing(false);
    }
  };

  // ── AI 摘要生成（獨立功能，可用於手動寫的文章） ──
  const handleGenerateSummary = async () => {
    const title = form.getValues('title');
    const content = form.getValues('content');

    if (!content || content.trim().length < 50) {
      toast.error('文章內容太短，無法生成摘要');
      return;
    }

    setIsGeneratingSummary(true);
    try {
      const response = await fetch('/llm-api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `你是一個部落格文章元資料生成器。請根據提供的文章內容，生成：
1. summary：120-220 字的文章摘要，以第三人稱視角撰寫，聚焦文章主軸，不腦補不存在的內容。風格簡潔、資訊密度高。
2. tags：3-8 個相關標籤，每個標籤是簡短的關鍵詞（如 React、Docker、CSS 等）。

回傳嚴格的 JSON 格式：
{
  "summary": "摘要文字",
  "tags": ["標籤1", "標籤2", "標籤3"]
}

只回傳 JSON，不要其他文字。`,
            },
            {
              role: 'user',
              content: `文章標題：${title || '未命名'}\n\n文章內容：\n${content.substring(0, 8000)}`,
            },
          ],
          max_tokens: 512,
          temperature: 0.3,
        }),
      });

      if (!response.ok) throw new Error(`API 錯誤 (${response.status})`);

      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content || '';

      let parsed;
      try {
        parsed = JSON.parse(resultText);
      } catch {
        const match = resultText.match(/(\{[\s\S]*\})/);
        if (match) {
          try { parsed = JSON.parse(match[1]); } catch { /* fallback */ }
        }
      }

      if (parsed?.summary) {
        form.setValue('summary', parsed.summary);
        toast.success('摘要已生成');

        // 如果 AI 也回傳了標籤，且目前標籤為空，則自動填入
        if (parsed.tags?.length > 0) {
          const currentTags = form.getValues('tags') || [];
          if (currentTags.length === 0) {
            const formattedTags = parsed.tags.map(t => ({
              label: t,
              value: t.toLowerCase().replace(/\s+/g, '-'),
            }));
            form.setValue('tags', formattedTags);
            toast.info(`同時生成了 ${formattedTags.length} 個標籤建議`);
          }
        }
      } else {
        toast.error('AI 回傳格式異常，請重試');
      }
    } catch (err) {
      console.error('AI 摘要生成失敗:', err);
      toast.error(`摘要生成失敗：${err.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
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
    <>
      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        <Form {...form}>
          <form className="flex flex-1 min-h-0">
            {/* Hidden buttons for AdminLayout header to trigger */}
            <button id="save-draft-btn" type="button" className="hidden" onClick={form.handleSubmit(onSaveDraft)} />
            <button id="publish-btn" type="button" className="hidden" onClick={form.handleSubmit(onPublish)} />
            {/* Left Column - Editor */}
            <main className="flex-1 overflow-y-auto p-6 min-w-0 space-y-0">
                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <input
                          {...field}
                          placeholder="輸入文章標題..."
                          className="w-full bg-transparent text-foreground/90 text-lg font-medium mb-5 pb-3 border-b border-border/30 outline-none focus:border-border transition-colors"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Content - 玻璃擬態編輯器 */}
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="glass rounded-xl overflow-hidden border border-border/50">
                          <MonacoEditor
                            value={field.value}
                            onChange={(v) => field.onChange(v ?? '')}
                            language="markdown"
                            height="700px"
                            theme="vs-dark"
                            onSave={() => form.handleSubmit(onSaveDraft)()}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </main>

            {/* Right Column - Settings */}
            <aside className="w-[280px] border-l border-border/30 glass-subtle shrink-0 hidden lg:block overflow-y-auto">
              <div className="p-4 space-y-5">
                {/* Category & Tags */}
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-3 flex items-center gap-2">
                    <Folder className="h-3.5 w-3.5" />
                    分類與標籤
                  </h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            分類
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 bg-accent/30">
                                <SelectValue placeholder="選擇分類" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.name}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="tags"
                      render={({ field }) => {
                        const selectedTags = field.value || [];
                        return (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              標籤
                              <span className="text-muted-foreground/50 ml-1">({tags.length} 個可用)</span>
                            </FormLabel>
                            <div className="text-[11px] text-muted-foreground/60 mb-1">
                              已選擇 {selectedTags.length} 項
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {selectedTags.map((tag) => (
                                <span
                                  key={tag.value}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/60 text-foreground/70 text-[11px] border border-border/40"
                                >
                                  {tag.label}
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(selectedTags.filter(t => t.value !== tag.value))}
                                    className="hover:text-foreground transition-colors ml-0.5"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <FormControl>
                              <TagSearchInput
                                tags={tags}
                                selectedTags={selectedTags}
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </div>

                {/* Publishing Options */}
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    發佈設定
                  </h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            狀態
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 bg-accent/30">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">草稿</SelectItem>
                              <SelectItem value="published">已發佈</SelectItem>
                              <SelectItem value="archived">已封存</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            自訂網址
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="custom-url-slug" className="h-8 bg-accent/30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="layout_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <LayoutTemplate className="h-3 w-3" />
                            樣板類型
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || 'record'}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 bg-accent/30">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="record">📅 紀錄（時效性）</SelectItem>
                              <SelectItem value="column">💎 專欄（無時間性）</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allowComments"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-xs text-muted-foreground">
                            允許留言
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="pin"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-xs text-muted-foreground">
                            置頂文章
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Cover Image */}
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-3 flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    封面圖片
                  </h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="cover"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            圖片網址
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/image.jpg"
                              className="h-8 bg-accent/30"
                            />
                          </FormControl>
                          {field.value && (
                            <div className="mt-2 rounded-lg overflow-hidden border">
                              <img
                                src={field.value}
                                alt="封面預覽"
                                className="w-full h-auto"
                              />
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="summary"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-xs text-muted-foreground">
                              摘要
                            </FormLabel>
                            <button
                              type="button"
                              onClick={handleGenerateSummary}
                              disabled={isGeneratingSummary}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isGeneratingSummary ? (
                                <><Loader2 className="size-3 animate-spin" />生成中...</>
                              ) : (
                                <><Sparkles className="size-3" />AI 生成</>
                              )}
                            </button>
                          </div>
                          <FormControl>
                            <textarea
                              {...field}
                              placeholder="文章摘要（點擊右上角 AI 生成或手動輸入）..."
                              rows={4}
                              className="w-full bg-accent/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-border/60 transition-colors"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </aside>
          </form>
        </Form>
      </div>
    </>
  );
}
