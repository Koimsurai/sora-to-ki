'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminCategoriesQueryOptions, adminTagsQueryOptions, adminPostDetailQueryOptions } from '@/data/adminData';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postSchema, type PostFormInput } from '@/schemas/post';
import { MonacoEditor } from '@/components/monaco-editor';
import { PostPreview } from './PostPreview';
import ExcerptLinksEditor from './ExcerptLinksEditor';
import type { ExcerptLink } from '@koimsurai/api-types';
import { publishPostPreview, type PostPreviewSnapshot, type PreviewText } from '@/store/postPreview';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  Clock,
  Folder,
  ImageIcon,
  X,
  Sparkles,
  LayoutTemplate,
  Languages,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useParams } from '@tanstack/react-router';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { defaultLocale } from '@/lib/locales';
// 改名：這個檔已經有一個叫 format 的狀態（文章是 md 還是 mdx）
import { format as formatDate } from 'date-fns';
import AdminLoading, { BusyDot } from './AdminLoading';
import { AdminDateField, AdminTimeField } from './AdminFields';
import { formatWhen, localInputToIso, statusLabel, toLocalInput } from './adminFormat';
import { setEditorScheduledAt } from '@/store/editorScheduleStore';
import { useConfirm } from '@/hooks/useConfirm';
import { at, useAdminT } from '@/i18n/admin-i18n';
import './AdminPage.css';
import './PostEditor.css';

interface TagOption {
  label: string;
  value: string;
}
type LocalizedField =
  | 'title'
  | 'content'
  | 'summary'
  | 'title_en'
  | 'content_en'
  | 'summary_en'
  | 'title_zh_cn'
  | 'content_zh_cn'
  | 'summary_zh_cn'
  | 'title_zh_tw'
  | 'content_zh_tw'
  | 'summary_zh_tw'
  | 'title_ja'
  | 'content_ja'
  | 'summary_ja'
  | 'title_ko'
  | 'content_ko'
  | 'summary_ko';

/**
 * v0 風格標籤搜尋選擇器
 */
function TagSearchInput({
  tags,
  selectedTags,
  onChange,
}: {
  tags: TagOption[];
  selectedTags: TagOption[];
  onChange: (tags: TagOption[]) => void;
}) {
  const { t: tr } = useAdminT();
  const [tagSearch, setTagSearch] = useState('');
  const selectedValues = new Set(selectedTags.map((t) => t.value));
  const filteredTags = tags.filter(
    (t) => !selectedValues.has(t.value) && t.label.toLowerCase().includes(tagSearch.toLowerCase()),
  );

  const addTag = (tag: TagOption) => {
    onChange([...selectedTags, tag]);
    setTagSearch('');
  };

  return (
    <div className="relative">
      <Input
        placeholder={tr('editor.tagSearchPlaceholder')}
        value={tagSearch}
        onChange={(e) => setTagSearch(e.target.value)}
        variant="glass"
        size="compact"
      />
      {tagSearch && filteredTags.length > 0 && (
        <div className="absolute left-0 right-0 mt-1.5 max-h-28 overflow-y-auto border border-border bg-popover p-1 z-50">
          {filteredTags.map((tag) => (
            <button
              key={tag.value}
              type="button"
              onClick={() => addTag(tag)}
              className="w-full text-left text-xs px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}
      {tagSearch && filteredTags.length === 0 && (
        <div className="absolute left-0 right-0 mt-1.5 border border-border bg-popover p-3 z-50">
          <p className="text-center text-xs text-muted-foreground/60">{tr('editor.tagNotFound')}</p>
        </div>
      )}
    </div>
  );
}

// ─── i18n 編輯常數 ──────────────────────────────
// label 是各語言自己的寫法，不跟著後台語言翻（語言切換慣例：認得自己的語言最直覺）
const LOCALE_TABS = [
  { code: 'zh-TW', label: '繁體', column: 'zh_tw' }, // i18n-ignore
  { code: 'en', label: 'English', column: 'en' },
  { code: 'zh-CN', label: '简体', column: 'zh_cn' }, // i18n-ignore
  { code: 'ja', label: '日本語', column: 'ja' }, // i18n-ignore
  { code: 'ko', label: '한국어', column: 'ko' }, // i18n-ignore
];
/**
 * API 回來的值 → 表單要的字串。
 *
 * `postSchema` 把這些欄位宣告成 `z.string().optional()`，而 zod 的 optional
 * **只接受 undefined**：DB 的 NULL（category、series_name…）與數字（series_order）
 * 都會讓整份表單驗不過。用 `?? ''` 只擋得掉 null／undefined，擋不掉數字。
 */
function asText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

/**
 * 驗證沒過時要說**哪一欄**沒過。
 *
 * 原本四個送出點都寫死「請先填寫標題與內容」，於是任何一個欄位驗不過都顯示同一句話。
 * 那不只是不精確——它會主動把人帶往錯的方向：實際發生過的是 `category` 為 null
 * 讓整篇存不起來，而畫面告訴站長去檢查標題與內容（那兩欄好好的）。
 * 帶上欄位名之後，同樣的情況會顯示「category：Invalid input」，至少查得下去。
 */
function firstErrorText(errors: Record<string, unknown>): string {
  for (const [field, err] of Object.entries(errors)) {
    const message = (err as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message) return at('editor.fieldError', { field, message });
  }
  return at('editor.invalidForm');
}

// 依 activeLocale + sourceLanguage 取得表單 field 名稱
function fieldNameFor(
  base: 'title' | 'content' | 'summary',
  activeLocale: string,
  sourceLanguage: string,
): LocalizedField {
  if (activeLocale === sourceLanguage) return base;
  const tab = LOCALE_TABS.find((t) => t.code === activeLocale);
  if (!tab?.column) return base; // fallback：未知 locale 用原文
  return `${base}_${tab.column}` as LocalizedField;
}

export default function PostEditor() {
  // strict: false —— 這個元件同時服務 /admin/posts/create（沒有 id）與
  // /admin/posts/edit/$id（有 id）。綁死單一路由的 Route.useParams() 在 create 那條會炸。
  const { id } = useParams({ strict: false });
  // 叫 tr 不叫 t：這個元件裡 t 已經是很多 callback 的參數名（語系分頁、計時器、標籤）
  const { t: tr } = useAdminT();
  const navigate = useNavigate();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingZhCN, setIsGeneratingZhCN] = useState(false);
  const [editorView, setEditorView] = useState('edit'); // edit | split | preview
  // 分類/標籤/文章明細改由 TanStack Query 讀（生成型別）；儲存等 mutation 各自處理。
  const { data: categories = [] } = useQuery(adminCategoriesQueryOptions);
  const { data: tagsData = [] } = useQuery(adminTagsQueryOptions);
  const tags = useMemo<TagOption[]>(
    () => tagsData.map((tag) => ({ label: tag.name, value: tag.id.toString() })),
    [tagsData],
  );
  const { data: postData, isPending: postPending } = useQuery({
    ...adminPostDetailQueryOptions(id ?? ''),
    enabled: !!id,
  });
  const isLoading = !!id && postPending; // 編輯模式載入文章時的骨架 gate
  const [activeLocale, setActiveLocale] = useState<string>(defaultLocale);
  const [zenMode, setZenMode] = useState(false);
  // 推送電子報、覆蓋簡中之前問一句（後台樣式的對話框，不是瀏覽器的 confirm）
  const { confirm, confirmDialog } = useConfirm();
  // 載入既有文章時，form.reset 在 Select mount 之後才跑 → Radix Select 的觸發器不會反映
  // 「事後才填進來的受控值」，看起來像被 reset（值其實有）。用這個旗標當 key 讓 Select 在
  // reset 完成後重新 mount 一次，用正確的值初始化 → 顯示正常。新文章保持 false（預設值本就正確）。
  const [hydrated, setHydrated] = useState(false);
  /** 摘要裡連到章節的句子（語系 → 句子）。不在表單裡：zod schema 管的是字串欄位，這個是結構 */
  const [excerptLinks, setExcerptLinks] = useState<Record<string, ExcerptLink[]>>({});
  const [autosaveStatus, setAutosaveStatus] = useState(''); // '', 'saved', 'restoring'
  const submitLockRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 狀態字（'saved'/'restoring'）1.8s 後自己消失。用 ref 追蹤才能在 unmount 時清掉，
  // 也避免連續存檔時多個計時器互相搶著把狀態清空。
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useCallback：只碰 ref 與 setState（兩者本身穩定），空依賴即恆等，
  // 才能誠實地列進下面 effect 的依賴陣列而不會每次 render 重跑 effect。
  const flashStatus = useCallback((s: string) => {
    setAutosaveStatus(s);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setAutosaveStatus('');
    }, 1800);
  }, []);
  const autosaveKey = `postEditor:autosave:${id ?? 'new'}`;

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
      publish_at: '',
      layout_type: 'record',
      allow_comments: true,
      send_newsletter: false,
      // i18n
      source_language: defaultLocale() as PostFormInput['source_language'],
      title_en: '',
      content_en: '',
      summary_en: '',
      title_zh_cn: '',
      content_zh_cn: '',
      summary_zh_cn: '',
      title_zh_tw: '',
      content_zh_tw: '',
      summary_zh_tw: '',
      title_ja: '',
      content_ja: '',
      summary_ja: '',
      title_ko: '',
      content_ko: '',
      summary_ko: '',
      // 系列文
      series_name: '',
      series_order: '',
    },
  });

  const sourceLanguage = form.watch('source_language') ?? defaultLocale();
  const publishAt = form.watch('publish_at') ?? '';
  const currentStatus = form.watch('status') ?? 'draft';

  // 頂列的主要按鈕看這個值決定寫「發佈文章」還是「排程發佈」；離開編輯器時清掉
  useEffect(() => {
    setEditorScheduledAt(publishAt);
  }, [publishAt]);
  useEffect(() => () => setEditorScheduledAt(''), []);
  const titleName = fieldNameFor('title', activeLocale, sourceLanguage);
  const contentName = fieldNameFor('content', activeLocale, sourceLanguage);
  const summaryName = fieldNameFor('summary', activeLocale, sourceLanguage);

  // 直接訂閱當前 locale 對應的欄位值，避免 <FormField name={dynamic}> 在切換時
  // 共用 controller/Monaco model 造成「第二次切回顯示舊內容」的 bug。
  const titleValue = form.watch(titleName) ?? '';
  const contentValueRaw = form.watch(contentName);
  const contentValue = typeof contentValueRaw === 'string' ? contentValueRaw : '';
  const summaryValue = form.watch(summaryName) ?? '';
  // 預覽走 mdx / markdown 哪條渲染路。編輯器不管理 format 欄位（由 MCP/後端預設決定），
  // 所以看載入文章的 format；新文章沿用後端預設 markdown。
  const format = postData?.format ?? 'markdown';

  // 若 sourceLanguage 切到目前 activeLocale 不合法時（例如原本 source=zh-TW, activeLocale=en，之後改 source=en
  // 則 en 的編輯欄位切到 base 欄位），這裡確保 activeLocale 仍然指向有效 tab
  useEffect(() => {
    // 修正失效的 tab 選擇：LOCALE_TABS 由 sourceLanguage 推導，改動時舊的 activeLocale
    // 可能已不在清單裡。這是「校正外部變動造成的無效選擇」，不是可推導的衍生值。
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    if (!LOCALE_TABS.some((t) => t.code === activeLocale)) setActiveLocale(sourceLanguage);
  }, [activeLocale, sourceLanguage]);

  // ── localStorage 自動備份草稿（debounce 1.2s）──
  useEffect(() => {
    const sub = form.watch((values) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        try {
          const hasContent = (values.title ?? '').trim() || (values.content ?? '').trim();
          if (!hasContent) return;
          localStorage.setItem(autosaveKey, JSON.stringify({ values, savedAt: Date.now() }));
          flashStatus('saved');
        } catch {
          /* quota exceeded 等 — 忽略 */
        }
      }, 1200);
    });
    // 除了退訂，兩個計時器也要收：debounce 中途 unmount 會留下 1.2s 的排程，
    // 狀態字的 1.8s 同理。
    return () => {
      sub.unsubscribe();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, [autosaveKey, form, flashStatus]);

  // ── 還原草稿：新文章載入時若有備份且尚未填內容，提示還原 ──
  useEffect(() => {
    if (id) return; // 編輯既有文章不還原
    try {
      const raw = localStorage.getItem(autosaveKey);
      if (!raw) return;
      const { values, savedAt } = JSON.parse(raw) as { values?: PostFormInput; savedAt?: number };
      if (!values || !savedAt) return;
      // 24 小時內的草稿才還原
      if (Date.now() - savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(autosaveKey);
        return;
      }
      const current = form.getValues();
      if ((current.title || current.content).trim()) return;
      const ago = Math.round((Date.now() - savedAt) / 60000);
      toast(at('editor.draftFound', { minutes: ago }), {
        action: {
          label: at('editor.restore'),
          onClick: () => {
            form.reset(values);
            flashStatus('restoring');
          },
        },
        duration: 8000,
      });
    } catch {
      /* 損毀的 JSON 等 — 忽略 */
    }
  }, [autosaveKey, form, id, flashStatus]);

  // ── 在前台預覽（admin/DraftPreview，/preview/post）──
  // 按下去才開始同步：開一個分頁，用讀者看到的文章頁畫正在編的內容（還沒存的也算），之後這裡一改那邊跟著更新
  const previewOpenRef = useRef(false);
  /** 編輯框（分頁列＋Monaco／預覽）：進 Zen 時捲到視窗頂端 */
  const frameRef = useRef<HTMLDivElement>(null);
  const buildPreviewSnapshot = useCallback((): PostPreviewSnapshot => {
    const v = form.getValues();
    const source = v.source_language ?? defaultLocale();
    const texts: Record<string, PreviewText> = {};
    for (const t of LOCALE_TABS) {
      const pick = (base: 'title' | 'content' | 'summary') => {
        const value = v[fieldNameFor(base, t.code, source)];
        return typeof value === 'string' ? value : '';
      };
      texts[t.code] = { title: pick('title'), content: pick('content'), excerpt: pick('summary') };
    }
    // 表單裡沒填是空字串，文章頁那邊的「沒有」是 null
    const orNull = (s: string | undefined) => (s?.trim() ? s : null);
    return {
      id: postData?.id ?? null,
      slug: orNull(v.slug),
      format,
      category: orNull(v.category),
      tags: (v.tags ?? []).map((tag) => (typeof tag === 'string' ? tag : tag.label)),
      series_name: orNull(v.series_name),
      series_order: v.series_order ? Number(v.series_order) : null,
      layout_type: v.layout_type ?? 'record',
      allow_comments: v.allow_comments ?? true,
      status: v.status ?? 'draft',
      source_language: source,
      created_at: postData?.created_at ?? null,
      updated_at: postData?.updated_at ?? null,
      view_count: postData?.view_count ?? 0,
      author: postData?.author ?? null,
      texts,
      excerpt_links: excerptLinks,
    };
  }, [form, postData, format, excerptLinks]);
  const openPreview = () => {
    previewOpenRef.current = true;
    publishPostPreview(buildPreviewSnapshot());
    // 同一個名字：再按一次是切回那個分頁，不會一直開新的
    window.open('/preview/post', 'koimsurai-draft-preview');
  };
  useEffect(() => {
    let timer = 0;
    const push = () => {
      if (!previewOpenRef.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => publishPostPreview(buildPreviewSnapshot()), 300);
    };
    const sub = form.watch(push);
    // 表單以外的變動（摘要連結、文章載入完）也要送一次
    push();
    return () => {
      sub.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [form, buildPreviewSnapshot]);

  // ── Zen 模式：F11 / Esc 切換 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setZenMode((z) => !z);
      } else if (e.key === 'Escape' && zenMode) setZenMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zenMode]);

  // 編輯區的高度：平常是固定的；Zen 模式整個編輯框撐滿視窗——進 Zen 時把框捲到視窗頂端
  // （語系分頁與標題留在上面，往上捲就看得到），所以要扣的只有框自己的分頁列、工具列、
  // 狀態列（量過約 122px）加上下留白，共 11rem。以前扣的是「上面所有東西」的估計值，
  // 結果在 1047 高的螢幕上反而比平常的 700px 還矮，下緣還超出視窗。
  const fullHeight = zenMode ? 'calc(100vh - 11rem)' : '700px';
  const halfHeight = zenMode ? 'calc(50vh - 5.5rem)' : '360px';
  const editorHeight = editorView === 'split' ? halfHeight : fullHeight;
  const previewHeight = editorView === 'split' ? halfHeight : fullHeight;

  // Zen 模式時隱藏 admin 側欄與 header（透過 body class）
  // 切換完 dispatch resize 讓 Monaco 重新計算尺寸（automaticLayout 監聽 ResizeObserver）
  useEffect(() => {
    document.body.classList.toggle('zen-mode-active', zenMode);
    // 等側欄收掉、版面重排之後再捲（scroll-margin-top 在 AdminTheme.css）
    const raf = zenMode ? requestAnimationFrame(() => frameRef.current?.scrollIntoView({ block: 'start' })) : 0;
    // 等下一個 frame，確保 CSS 套用完才觸發 resize
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      document.body.classList.remove('zen-mode-active');
    };
  }, [zenMode]);

  // 編輯模式：query 取回文章後填入 RHF 表單（excerpt* → summary*、tags 格式化、各 locale 同步）。
  useEffect(() => {
    if (!postData) return;
    const formattedData = {
      ...postData,
      tags: formatTags(postData.tags),
      summary: asText(postData.excerpt),
      // ⚠️ 每一個「schema 宣告成 optional string」的欄位都要過 asText，一個都不能漏。
      //
      // 漏掉的後果不是「少了預設值」而是**整篇文章存不起來**，而且症狀完全指不到這裡：
      // zod 的 `.optional()` 只接受 undefined，不接受 null 也不接受 number。
      // DB 裡 category 是 NULL（沒選分類就是這樣）、series_order 是數字，
      // 兩者都會讓 reset 進來的表單永遠驗不過——站長按儲存只會看到一句錯誤訊息，
      // 而標題與內容明明都填了。是寫 e2e 時撞到的，兩個欄位是分兩次才找齊的
      // （第一次修完 category 又冒出 series_order），所以這裡改成統一走同一個函式。
      category: asText(postData.category),
      slug: asText(postData.slug),
      source_language: postData.source_language ?? defaultLocale(),
      title_en: asText(postData.title_en),
      content_en: asText(postData.content_en),
      summary_en: asText(postData.excerpt_en),
      title_zh_cn: asText(postData.title_zh_cn),
      content_zh_cn: asText(postData.content_zh_cn),
      summary_zh_cn: asText(postData.excerpt_zh_cn),
      title_zh_tw: asText(postData.title_zh_tw),
      content_zh_tw: asText(postData.content_zh_tw),
      summary_zh_tw: asText(postData.excerpt_zh_tw),
      title_ja: asText(postData.title_ja),
      content_ja: asText(postData.content_ja),
      summary_ja: asText(postData.excerpt_ja),
      title_ko: asText(postData.title_ko),
      content_ko: asText(postData.content_ko),
      summary_ko: asText(postData.excerpt_ko),
      allow_comments: postData.allow_comments,
      series_name: asText(postData.series_name),
      series_order: asText(postData.series_order),
      // 排程中的文章：時間換回本地時間給 datetime-local；排程時勾的電子報也要照實顯示
      publish_at: toLocalInput(postData.publish_at),
      send_newsletter: postData.status === 'scheduled' && postData.newsletter_pending,
    };
    form.reset(formattedData as PostFormInput);
    // 載入既有文章 → 把編輯器狀態同步成該篇的值。資料是非同步來的，render 期沒有。
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setActiveLocale(postData.source_language ?? defaultLocale());
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setExcerptLinks(postData.excerpt_links);
    // reset 完成 → 讓下方 Select 依 key 重新 mount、以正確值初始化（此 set-state 是刻意的）
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setHydrated(true);
    // 只跟著 postData 跑：form 是 react-hook-form 的實例，進依賴會讓每次 render 都重灌表單。
    // （原本的 react-hooks/ 命名空間在換 oxlint 後已失效。）
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [postData]);

  /**
   * 格式化標籤數據
   * 支援多種輸入格式：
   * 1. 字串陣列: ["React", "TypeScript"]
   * 2. 物件陣列: [{label: "React", value: "1"}]
   * 3. 混合格式
   */
  const formatTags = (tags: unknown): TagOption[] => {
    if (!Array.isArray(tags)) {
      return [];
    }

    return (tags as unknown[]).map((tag, index) => {
      // 如果是字串，轉換為物件格式
      if (typeof tag === 'string') {
        return {
          label: tag,
          value: tag.toLowerCase().replace(/\s+/g, '-'),
        };
      }
      // 如果已經是物件，確保有 label 和 value
      if (tag && typeof tag === 'object') {
        const t = tag as { label?: string; name?: string; value?: string; id?: number | string };
        return {
          label: t.label ?? t.name ?? `Tag ${index + 1}`,
          value: t.value ?? t.id?.toString() ?? `tag-${index}`,
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
  const handleSendNewsletter = async () => {
    const ok = await confirm({
      title: tr('editor.newsletter.confirmTitle'),
      description: tr('editor.newsletter.confirmBody'),
      confirmLabel: tr('editor.newsletter.confirmLabel'),
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/posts/${id}/send-newsletter`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = (await res.json()) as { error?: string; sent?: number; failed?: number };
      if (!res.ok) {
        toast.error(data.error ?? tr('editor.newsletter.failed'));
        return;
      }
      toast.success(tr('editor.newsletter.sent', { sent: data.sent, failed: data.failed }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('editor.newsletter.failed'));
    }
  };

  // 將表單 data 轉成送往 API 的 payload（包含 i18n 欄位，並把 summary* 對應到 excerpt*）
  const buildPayload = (data: PostFormInput, overrides: Record<string, unknown> = {}) => {
    const tagsArray = Array.isArray(data.tags)
      ? data.tags.map((tag) => (typeof tag === 'string' ? tag : tag.label))
      : [];
    const { summary, summary_en, summary_zh_cn, summary_zh_tw, summary_ja, summary_ko, ...rest } = data;
    return {
      ...rest,
      excerpt: summary,
      excerpt_en: summary_en,
      excerpt_zh_cn: summary_zh_cn,
      excerpt_zh_tw: summary_zh_tw,
      excerpt_ja: summary_ja,
      excerpt_ko: summary_ko,
      tags: tagsArray,
      // 每個語系都送（沒有的送空陣列）：後端是「有帶到的語系整組換掉、空的刪掉」，
      // 只送有連的語系的話，取消掉最後一句連結的那個語系會留在資料庫裡
      excerpt_links: Object.fromEntries(LOCALE_TABS.map((t) => [t.code, excerptLinks[t.code] ?? []])),
      // 表單裡的是本地時間字串，不能原樣送；排程時由 onPublish 換成帶時區的 ISO 放進 overrides
      publish_at: null,
      ...overrides,
    };
  };

  const onSaveDraft = async (data: PostFormInput, opts: { exit?: boolean } = {}) => {
    if (submitLockRef.current) {
      toast.info(tr('editor.busySaving'));
      return;
    }
    submitLockRef.current = true;
    setIsSavingDraft(true);
    try {
      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      const payload = buildPayload(data, { status: 'draft' });

      const response = await fetch(url, {
        method,
        headers: jsonAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(tr('editor.draftSaved'));
        try {
          localStorage.removeItem(autosaveKey);
        } catch {
          /* ignore */
        }
        const result = (await response.json()) as { data?: { id?: string | number }; id?: string | number };
        // 後端 create 回 { data: { id } }；沒抓到就會每次都 POST → 重複建立草稿
        const newId = result.data?.id ?? result.id;
        if (opts.exit) {
          void navigate({ to: '/admin/posts' }); // 「存並回列表」：存完直接回列表
        } else if (!id && newId) {
          // 動態段走 params 而不是字串內插——路徑本身因此是型別檢查過的
          void navigate({ to: '/admin/posts/edit/$id', params: { id: String(newId) } });
        }
      } else {
        toast.error(tr('editor.saveFailed'));
      }
    } catch (error) {
      console.error('儲存失敗:', error); // i18n-ignore：開發者看的 console，不是介面
      toast.error(tr('editor.saveFailed'));
    } finally {
      setIsSavingDraft(false);
      submitLockRef.current = false;
    }
  };

  const onPublish = async (data: PostFormInput) => {
    if (submitLockRef.current) {
      toast.info(tr('editor.busyProcessing'));
      return;
    }
    // 填了排程時間就是排程發佈；時間已經過了就停下來問人，不擅自當成「立刻發」
    const scheduleAt = localInputToIso(data.publish_at ?? '');
    if (scheduleAt && new Date(scheduleAt).getTime() <= Date.now()) {
      toast.error(tr('editor.schedulePast'));
      return;
    }
    submitLockRef.current = true;
    setIsPublishing(true);
    try {
      const url = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = id ? 'PUT' : 'POST';
      const payload = buildPayload(
        data,
        scheduleAt ? { status: 'scheduled', publish_at: scheduleAt } : { status: 'published' },
      );

      const response = await fetch(url, {
        method,
        headers: jsonAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(
          scheduleAt
            ? tr('editor.scheduledToast', { when: formatWhen(new Date(scheduleAt), 'MM.dd HH:mm') })
            : tr('editor.publishedToast'),
        );
        // 若有勾「發佈時推送 Newsletter」，後端會在 data.newsletter 回寄送結果
        try {
          const body = (await response.json()) as {
            data?: { newsletter?: { sent?: number; failed?: number; error?: string } };
          };
          const nl = body.data?.newsletter;
          if (nl?.error) toast.error(tr('editor.newsletter.publishFailed', { error: nl.error }));
          else if (nl)
            toast.success(tr('editor.newsletter.publishSent', { sent: nl.sent ?? 0, failed: nl.failed ?? 0 }));
        } catch {
          /* 回應非 JSON 不影響發佈成功 */
        }
        try {
          localStorage.removeItem(autosaveKey);
        } catch {
          /* ignore */
        }
        void navigate({ to: '/admin/posts' });
      } else {
        // 排程時間不對之類的 400 會帶理由，照實顯示
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? tr('editor.publishFailed'));
      }
    } catch (error) {
      console.error('發佈失敗:', error); // i18n-ignore：開發者看的 console，不是介面
      toast.error(tr('editor.publishFailed'));
    } finally {
      setIsPublishing(false);
      submitLockRef.current = false;
    }
  };

  // ── OpenCC：由繁中（原稿或繁中譯文）自動產生简体中文（純字詞轉換，不丟 LLM） ──
  const handleGenerateZhCN = async () => {
    if (!id) {
      toast.error(tr('editor.zhCn.needId'));
      return;
    }
    if (sourceLanguage !== 'zh-TW' && !postData?.title_zh_tw) {
      toast.error(tr('editor.zhCn.needSource'));
      return;
    }
    const existing = form.getValues('title_zh_cn') ?? form.getValues('content_zh_cn');
    if (
      existing &&
      !(await confirm({
        title: tr('editor.zhCn.overwriteTitle'),
        description: tr('editor.zhCn.overwriteBody'),
        confirmLabel: tr('editor.zhCn.overwriteLabel'),
        danger: true,
      }))
    )
      return;

    setIsGeneratingZhCN(true);
    try {
      // 先把最新的 zh-TW 原文存一次，讓 OpenCC 以最新內容轉換
      await fetch(`/api/admin/posts/${id}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(buildPayload(form.getValues())),
      });

      const res = await fetch(`/api/admin/posts/${id}/generate-zh-cn`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? tr('editor.apiError', { status: res.status }));
      }
      const data = (await res.json()) as {
        title_zh_cn?: string;
        content_zh_cn?: string;
        excerpt_zh_cn?: string;
        excerpt_links_zh_cn?: ExcerptLink[];
      };
      form.setValue('title_zh_cn', data.title_zh_cn ?? '');
      form.setValue('content_zh_cn', data.content_zh_cn ?? '');
      form.setValue('summary_zh_cn', data.excerpt_zh_cn ?? '');
      // 後端把繁體的摘要連結也轉好存進去了；手上這份是轉之前的，不換掉的話下次存檔會蓋回去
      setExcerptLinks((prev) => ({ ...prev, 'zh-CN': data.excerpt_links_zh_cn ?? [] }));
      toast.success(tr('editor.zhCn.done'));
      setActiveLocale('zh-CN');
    } catch (e) {
      console.error('OpenCC 生成失敗:', e); // i18n-ignore：開發者看的 console，不是介面
      toast.error(tr('editor.zhCn.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setIsGeneratingZhCN(false);
    }
  };

  // ── AI 摘要生成（獨立功能，可用於手動寫的文章） ──
  const handleGenerateSummary = async () => {
    // 依 activeLocale 生成對應語言的摘要，並以該 locale 的 title/content 作為輸入
    const title = form.getValues(titleName);
    const content = form.getValues(contentName);

    if (!content || content.trim().length < 50) {
      toast.error(tr('editor.summary.tooShort'));
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
              // 給模型的提示詞不是介面文字，不跟著後台語言換（要的語言已經用 activeLocale 講了）。
              // 一行一個字串，才能在每一行標 i18n-ignore；接起來跟原本的樣板字串一字不差
              content: [
                `你是一個部落格文章元資料生成器。請以 ${activeLocale} 撰寫，根據提供的文章內容產生：`, // i18n-ignore
                '1. summary：120-220 字（或對應語言的合適長度）的文章摘要，以第三人稱視角撰寫，聚焦文章主軸，不腦補不存在的內容。風格簡潔、資訊密度高。', // i18n-ignore
                '2. tags：3-8 個相關標籤，每個標籤是簡短的關鍵詞（如 React、Docker、CSS 等）。', // i18n-ignore
                '',
                '回傳嚴格的 JSON 格式：', // i18n-ignore
                '{',
                '  "summary": "摘要文字",', // i18n-ignore
                '  "tags": ["標籤1", "標籤2", "標籤3"]', // i18n-ignore
                '}',
                '',
                '只回傳 JSON，不要其他文字。', // i18n-ignore
              ].join('\n'),
            },
            {
              role: 'user',
              content: `文章標題：${title ?? '未命名'}\n\n文章內容：\n${content.substring(0, 8000)}`, // i18n-ignore：給模型的提示詞
            },
          ],
          max_tokens: 512,
          temperature: 0.3,
        }),
      });

      if (!response.ok) throw new Error(tr('editor.apiError', { status: response.status }));

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const resultText = data.choices?.[0]?.message?.content ?? '';

      let parsed: { summary?: string; tags?: string[] } | undefined;
      try {
        parsed = JSON.parse(resultText) as { summary?: string; tags?: string[] };
      } catch {
        const match = /(\{[\s\S]*\})/.exec(resultText);
        if (match) {
          try {
            parsed = JSON.parse(match[1]) as { summary?: string; tags?: string[] };
          } catch {
            /* fallback */
          }
        }
      }

      if (parsed?.summary) {
        form.setValue(summaryName, parsed.summary);
        toast.success(tr('editor.summary.done', { locale: activeLocale }));

        // 如果 AI 也回傳了標籤，且目前標籤為空，則自動填入
        if ((parsed.tags?.length ?? 0) > 0) {
          const currentTags = form.getValues('tags') ?? [];
          if (currentTags.length === 0) {
            const formattedTags = (parsed.tags ?? []).map((t) => ({
              label: t,
              value: t.toLowerCase().replace(/\s+/g, '-'),
            }));
            form.setValue('tags', formattedTags);
            toast.info(tr('editor.summary.tagsSuggested', { n: formattedTags.length }));
          }
        }
      } else {
        toast.error(tr('editor.summary.badFormat'));
      }
    } catch (err) {
      console.error('AI 摘要生成失敗:', err); // i18n-ignore：開發者看的 console，不是介面
      toast.error(tr('editor.summary.failed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  if (isLoading) return <AdminLoading label={tr('editor.loadingPost')} page />;

  return (
    <>
      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        <Form {...form}>
          <form className="flex flex-1 min-h-0">
            {/* Hidden buttons for AdminLayout header to trigger */}
            <button
              id="save-draft-btn"
              aria-hidden
              tabIndex={-1}
              type="button"
              className="hidden"
              disabled={isSavingDraft || isPublishing}
              onClick={(e) => {
                void form.handleSubmit(
                  (d) => onSaveDraft(d),
                  (errs) => toast.error(firstErrorText(errs)),
                )(e);
              }}
            />
            <button
              id="save-exit-btn"
              aria-hidden
              tabIndex={-1}
              type="button"
              className="hidden"
              disabled={isSavingDraft || isPublishing}
              onClick={(e) => {
                void form.handleSubmit(
                  (d) => onSaveDraft(d, { exit: true }),
                  (errs) => toast.error(firstErrorText(errs)),
                )(e);
              }}
            />
            <button
              id="publish-btn"
              aria-hidden
              tabIndex={-1}
              type="button"
              className="hidden"
              disabled={isSavingDraft || isPublishing}
              onClick={(e) => {
                void form.handleSubmit(onPublish, (errs) => toast.error(firstErrorText(errs)))(e);
              }}
            />
            {/* Left Column - Editor */}
            <main className="flex-1 overflow-y-auto p-6 min-w-0 space-y-0">
              {/* Locale tabs */}
              {/* 語系分頁：正在編的是琥珀點、已經有內容的是墨點、還沒寫的是空心 */}
              <div className="pe-locales">
                {LOCALE_TABS.map((t) => {
                  const isSource = t.code === sourceLanguage;
                  const titleVal = form.watch(fieldNameFor('title', t.code, sourceLanguage));
                  const hasContent = !!titleVal?.trim();
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setActiveLocale(t.code)}
                      className="adm-tab pe-locale"
                      aria-pressed={activeLocale === t.code}
                      data-has={hasContent || undefined}
                    >
                      <span className="adm-tab-dot" aria-hidden="true" />
                      {t.label}
                      {isSource && <span className="adm-meta">{tr('editor.sourceBadge')}</span>}
                    </button>
                  );
                })}
                {sourceLanguage !== 'zh-CN' && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleGenerateZhCN();
                    }}
                    disabled={isGeneratingZhCN}
                    className="adm-btn adm-btn-small pe-locale-action"
                    title={tr('editor.zhCn.buttonTitle')}
                  >
                    {isGeneratingZhCN && <BusyDot />}
                    {tr('editor.zhCn.button')}
                  </button>
                )}
              </div>

              {/* i18n 多語系提示 */}
              <p className="adm-meta pe-hint">
                {tr('editor.editingHint', { locale: LOCALE_TABS.find((t) => t.code === activeLocale)?.label ?? '' })}
              </p>

              {/* Title (per-locale) — 直接用 form.watch/setValue，避免 FormField 動態 name 的 bug */}
              <input
                key={`title-${activeLocale}`}
                value={titleValue}
                onChange={(e) => form.setValue(titleName, e.target.value, { shouldDirty: true })}
                placeholder={tr('editor.titlePlaceholder')}
                aria-label={tr('editor.titleLabel')}
                className="pe-title"
              />

              {/* Content (per-locale)：原稿與預覽 */}
              <div className="pe-frame" ref={frameRef}>
                <div className="pe-frame-bar">
                  <button
                    type="button"
                    className="adm-tab pe-view"
                    aria-pressed={editorView === 'edit'}
                    onClick={() => setEditorView('edit')}
                  >
                    {tr('editor.view.edit')}
                  </button>
                  <button
                    type="button"
                    className="adm-tab pe-view"
                    aria-pressed={editorView === 'split'}
                    onClick={() => setEditorView('split')}
                  >
                    {tr('editor.view.split')}
                  </button>
                  <button
                    type="button"
                    className="adm-tab pe-view"
                    aria-pressed={editorView === 'preview'}
                    onClick={() => setEditorView('preview')}
                  >
                    {tr('editor.view.preview')}
                  </button>
                  <button
                    type="button"
                    className="adm-tab pe-view"
                    title={tr('editor.view.frontTitle')}
                    onClick={openPreview}
                  >
                    {tr('editor.view.front')}
                  </button>
                  <div className="pe-frame-status">
                    {autosaveStatus === 'saved' && <span className="adm-meta">{tr('editor.autosaved')}</span>}
                    {autosaveStatus === 'restoring' && <span className="adm-meta">{tr('editor.restored')}</span>}
                    <button
                      type="button"
                      title={zenMode ? tr('editor.zen.exitTitle') : tr('editor.zen.enterTitle')}
                      aria-label={zenMode ? tr('editor.zen.exitLabel') : tr('editor.zen.enterLabel')}
                      onClick={() => setZenMode((z) => !z)}
                      className="adm-icon-btn"
                    >
                      {zenMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </button>
                  </div>
                </div>

                {editorView !== 'preview' && (
                  <MonacoEditor
                    key={`monaco-${activeLocale}`}
                    path={`post.${activeLocale}.md`}
                    value={contentValue}
                    onChange={(v) => form.setValue(contentName, v ?? '', { shouldDirty: true })}
                    language="markdown"
                    height={editorHeight}
                    onSave={() => {
                      void form.handleSubmit(
                        (d) => onSaveDraft(d),
                        (errs) => toast.error(firstErrorText(errs)),
                      )();
                    }}
                  />
                )}

                {editorView !== 'edit' && (
                  <div className="pe-preview" style={{ maxHeight: previewHeight }}>
                    {/* 跟前台同一套渲染（MDX blocks / 程式碼高亮 / alert / 連結卡）→ 所見即所得 */}
                    <PostPreview content={contentValue} format={format} />
                  </div>
                )}
              </div>
            </main>

            {/* Right Column - Settings */}
            <aside className="w-[300px] shrink-0 hidden lg:block pe-side">
              <div className="p-4 space-y-5">
                {/* Category & Tags */}
                <div>
                  <h3 className="pe-side-head">
                    <Folder className="h-3.5 w-3.5" />
                    {tr('editor.side.categoryTags')}
                  </h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('editor.side.category')}</FormLabel>
                          <Select
                            // hydrated + categories.length 進 key：載入完成或選項到齊時重新 mount，
                            // 讓觸發器顯示已載入的分類（Radix Select 不反映 mount 後才變的受控值）。
                            key={`category-${hydrated ? 'r' : 'i'}-${categories.length}`}
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger variant="glass" size="compact">
                                <SelectValue placeholder={tr('editor.side.categoryPlaceholder')} />
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
                        const selectedTags = field.value ?? [];
                        return (
                          <FormItem>
                            <FormLabel>
                              {tr('editor.side.tags')}
                              <span className="text-muted-foreground/50 ml-1">
                                {tr('editor.side.tagsAvailable', { n: tags.length })}
                              </span>
                            </FormLabel>
                            <div className="text-fs-11 text-muted-foreground/60 mb-1">
                              {tr('editor.side.tagsSelected', { n: selectedTags.length })}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {selectedTags.map((tag) => (
                                <span
                                  key={tag.value}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-foreground/70 text-fs-11 border border-border"
                                >
                                  {tag.label}
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(selectedTags.filter((t) => t.value !== tag.value))}
                                    className="hover:text-foreground transition-colors ml-0.5"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <FormControl>
                              <TagSearchInput tags={tags} selectedTags={selectedTags} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </div>

                {/* Series — 系列文 */}
                <div>
                  <h3 className="pe-side-head">
                    <FileText className="h-3.5 w-3.5" />
                    {tr('editor.series.head')}
                  </h3>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="series_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('editor.series.name')}</FormLabel>
                          <FormControl>
                            <input
                              {...field}
                              placeholder={tr('editor.series.namePlaceholder')}
                              className="h-8 w-full border px-2 text-sm outline-hidden"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="series_order"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('editor.series.order')}</FormLabel>
                          <FormControl>
                            <input
                              type="number"
                              {...field}
                              placeholder={tr('editor.series.orderPlaceholder')}
                              className="h-8 w-full border px-2 text-sm outline-hidden"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Publishing Options */}
                <div>
                  <h3 className="pe-side-head">
                    <Clock className="h-3.5 w-3.5" />
                    {tr('editor.publishing.head')}
                  </h3>
                  <div className="space-y-4">
                    {/* 狀態由頂列按下的那顆按鈕決定，這裡只顯示現在是什麼 */}
                    <p className="pe-state">
                      <span className="adm-caps">{tr('editor.publishing.now')}</span>
                      <span className="adm-status" data-status={currentStatus}>
                        {statusLabel(currentStatus)}
                      </span>
                    </p>

                    <FormField
                      control={form.control}
                      name="publish_at"
                      render={({ field }) => {
                        // 值照舊是 datetime-local 的寫法（yyyy-MM-ddTHH:mm），拆成日期與時間兩格來填。
                        // 只填日期就當早上九點；只填時間就當今天
                        const [day = '', time = ''] = (field.value ?? '').split('T');
                        const setSchedule = (d: string, t: string) => {
                          if (!d && !t) return field.onChange('');
                          field.onChange(`${d || formatDate(new Date(), 'yyyy-MM-dd')}T${t || '09:00'}`);
                        };
                        return (
                          <FormItem>
                            <FormLabel>{tr('editor.publishing.schedule')}</FormLabel>
                            <div className="pe-schedule">
                              <AdminDateField
                                label={tr('editor.publishing.scheduleDate')}
                                value={day}
                                onChange={(d) => setSchedule(d, time)}
                              />
                              <AdminTimeField
                                label={tr('editor.publishing.scheduleTime')}
                                value={time}
                                onChange={(t) => setSchedule(day, t)}
                              />
                              {field.value && (
                                <button
                                  type="button"
                                  className="adm-btn adm-btn-small"
                                  onClick={() => form.setValue('publish_at', '', { shouldDirty: true })}
                                >
                                  {tr('editor.publishing.clear')}
                                </button>
                              )}
                            </div>
                            <p className="pe-side-hint">
                              {field.value ? tr('editor.publishing.hintScheduled') : tr('editor.publishing.hintEmpty')}
                            </p>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    <FormField
                      control={form.control}
                      name="source_language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <Languages className="h-3 w-3" />
                            {tr('editor.publishing.sourceLanguage')}
                          </FormLabel>
                          <Select
                            key={`srclang-${hydrated ? 'r' : 'i'}`}
                            onValueChange={(v) => {
                              field.onChange(v);
                              if (activeLocale === sourceLanguage) setActiveLocale(v);
                            }}
                            value={field.value ?? defaultLocale()}
                          >
                            <FormControl>
                              <SelectTrigger variant="glass" size="compact">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="zh-TW">{tr('layout.languageName.zh-TW')}</SelectItem>
                              <SelectItem value="zh-CN">{tr('layout.languageName.zh-CN')}</SelectItem>
                              <SelectItem value="en">{tr('layout.languageName.en')}</SelectItem>
                              <SelectItem value="ja">{tr('layout.languageName.ja')}</SelectItem>
                              <SelectItem value="ko">{tr('layout.languageName.ko')}</SelectItem>
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
                          <FormLabel>{tr('editor.publishing.slug')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="blog-post-rendering-strategy"
                              variant="glass"
                              size="compact"
                            />
                          </FormControl>
                          <p className="text-fs-10 text-muted-foreground/60">{tr('editor.publishing.slugHint')}</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="layout_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <LayoutTemplate className="h-3 w-3" />
                            {tr('editor.publishing.layout')}
                          </FormLabel>
                          <Select
                            key={`layout-${hydrated ? 'r' : 'i'}`}
                            onValueChange={field.onChange}
                            value={field.value ?? 'record'}
                          >
                            <FormControl>
                              <SelectTrigger variant="glass" size="compact">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="record">{tr('editor.publishing.layoutRecord')}</SelectItem>
                              <SelectItem value="column">{tr('editor.publishing.layoutColumn')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allow_comments"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel>{tr('editor.publishing.allowComments')}</FormLabel>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Newsletter trigger — auto-broadcast on publish */}
                    <FormField
                      control={form.control}
                      name="send_newsletter"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <FormLabel>{tr('editor.newsletter.onPublish')}</FormLabel>
                            <span className="text-fs-10 text-muted-foreground/60">
                              {tr('editor.newsletter.onPublishHint')}
                            </span>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Manual broadcast — only for already-published posts */}
                    {id && form.watch('status') === 'published' && (
                      <button
                        type="button"
                        className="adm-btn pe-wide"
                        disabled={isSavingDraft || isPublishing}
                        onClick={() => {
                          void handleSendNewsletter();
                        }}
                      >
                        {tr('editor.newsletter.sendNow')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Cover Image */}
                <div>
                  <h3 className="pe-side-head">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {tr('editor.cover.head')}
                  </h3>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="cover"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tr('editor.cover.url')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/image.jpg"
                              variant="glass"
                              size="compact"
                            />
                          </FormControl>
                          {field.value && (
                            <div className="mt-2 overflow-hidden border">
                              <img src={field.value} alt={tr('editor.cover.alt')} className="w-full h-auto" />
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">
                          {tr('editor.summary.label')}{' '}
                          <span className="text-muted-foreground/50">({activeLocale})</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            void handleGenerateSummary();
                          }}
                          disabled={isGeneratingSummary}
                          className="adm-btn adm-btn-small"
                        >
                          {isGeneratingSummary ? (
                            <>
                              <BusyDot />
                              {tr('editor.summary.generating')}
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-3" />
                              {tr('editor.summary.generate')}
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        key={`summary-${activeLocale}`}
                        value={summaryValue}
                        onChange={(e) => form.setValue(summaryName, e.target.value, { shouldDirty: true })}
                        placeholder={tr('editor.summary.placeholder')}
                        rows={4}
                        className="w-full border px-3 py-2 text-sm resize-none focus:outline-hidden mt-1"
                      />
                      <ExcerptLinksEditor
                        excerpt={summaryValue}
                        content={contentValue}
                        links={excerptLinks[activeLocale] ?? []}
                        localeLabel={LOCALE_TABS.find((t) => t.code === activeLocale)?.label}
                        onChange={(next) => setExcerptLinks((prev) => ({ ...prev, [activeLocale]: next }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </form>
        </Form>
      </div>
      {confirmDialog}
    </>
  );
}
