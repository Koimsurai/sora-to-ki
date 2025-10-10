'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postSchema } from '@/schemas/post';
import { MonacoEditor } from '@/components/monaco-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import MultipleSelector from '@/components/ui/multiple-selector';
import {
  FileText,
  Save,
  Send,
  Eye,
  Clock,
  Folder,
  ImageIcon,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams } from 'react-router-dom';

export default function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
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
        // 確保 tags 格式正確
        const formattedData = {
          ...data,
          tags: formatTags(data.tags),
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
        setTags(data.map(tag => ({ label: tag.name, value: tag.id.toString() })));
      }
    } catch (error) {
      console.error('載入標籤失敗:', error);
    }
  };

  const onSaveDraft = async (data) => {
    setIsSavingDraft(true);
    try {
      const token = localStorage.getItem('adminToken');
      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...data, status: 'draft' }),
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
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...data, status: 'published' }),
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
    <>
      {/* Header */}
            {/* Header - 玻璃擬態 */}
      <header className="sticky top-0 z-50 glass-effect">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="gap-2"
              >
                <Link to="/admin/posts">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">返回</span>
                </Link>
              </Button>
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              <h1 className="text-lg sm:text-xl font-bold">
                {id ? '編輯文章' : '新增文章'}
              </h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 sm:gap-2"
                onClick={form.handleSubmit(onSaveDraft)}
                disabled={isSavingDraft}
              >
                <Save className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">
                  {isSavingDraft ? '儲存中...' : '儲存草稿'}
                </span>
                <span className="sm:hidden">儲存</span>
              </Button>
              <Button
                size="sm"
                className="gap-1 sm:gap-2"
                onClick={form.handleSubmit(onPublish)}
                disabled={isPublishing}
              >
                <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">
                  {isPublishing ? '發佈中...' : '發佈文章'}
                </span>
                <span className="sm:hidden">發佈</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        <Form {...form}>
          <form className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Editor */}
              <div className="lg:col-span-2 space-y-6">
                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="輸入文章標題..."
                          className="text-2xl font-bold border-0 focus-visible:ring-0 px-0"
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
                        <div>
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
              </div>

              {/* Right Column - Settings */}
              <div className="lg:col-span-1 space-y-6">
                {/* Category & Tags */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Folder className="h-4 w-4 text-primary" />
                      分類與標籤
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                              <SelectTrigger>
                                <SelectValue placeholder="選擇分類" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id.toString()}>
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
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            標籤
                          </FormLabel>
                          <FormControl>
                            <MultipleSelector
                              {...field}
                              options={tags}
                              placeholder="選擇標籤..."
                              emptyIndicator={
                                <p className="text-center text-sm text-muted-foreground">
                                  沒有找到相關標籤
                                </p>
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Publishing Options */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-primary" />
                      發佈設定
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                              <SelectTrigger>
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
                            <Input {...field} placeholder="custom-url-slug" />
                          </FormControl>
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
                  </CardContent>
                </Card>

                {/* Cover Image */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      封面圖片
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                          <FormLabel className="text-xs text-muted-foreground">
                            摘要
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="文章摘要..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </>
  );
}
