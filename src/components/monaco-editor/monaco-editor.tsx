import { useRef, useCallback, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Editor from '@monaco-editor/react';
import type { editor, IDisposable } from 'monaco-editor';
import { MonacoToolbar } from './monaco-toolbar';
import PhotoSelectorModal from '../admin/PhotoSelectorModal';
import { useMonacoShortcuts } from './monaco-shortcuts';
import { MonacoTextHelper } from './monaco-text-helper';
import { MonacoEditorProps } from './types';
import './monaco-glass.css';

export default function MonacoEditor({
  value,
  onChange,
  language = 'markdown',
  theme = 'vs-dark',
  height = '400px',
  options = {},
  onSave,
  showToolbar = true,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const textHelperRef = useRef<MonacoTextHelper | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const disposablesRef = useRef<IDisposable[]>([]);

  // NAS Selector State
  const [showNASSelector, setShowNASSelector] = useState(false);

  // 統計數據
  const [totalWords, setTotalWords] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [totalLines, setTotalLines] = useState(0);

  const [selWords, setSelWords] = useState(0);
  const [selChars, setSelChars] = useState(0);
  const [selLines, setSelLines] = useState(0);

  /**
   * 開啟 NAS 照片選擇器
   */
  const handleNAS = useCallback(() => {
    setShowNASSelector(true);
  }, []);

  /**
   * 處理 NAS 照片選擇
   */
  const handleNASSelect = useCallback((photo: any) => {
    // 插入 markdown 圖片
    const editor = editorRef.current;
    if (!editor) return;

    const position = editor.getPosition();
    if (position) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monacoNs = (window as any).monaco;
      if (monacoNs) {
        // 使用 highResUrl 或 thumbnailUrl，這裡預設 highResUrl
        // 需注意 url 已經包含 /nas-images/ 前綴
        const imageUrl = photo.highResUrl || photo.thumbnailUrl;
        const textToInsert = `![${photo.title || 'image'}](${imageUrl})\n`;

        editor.executeEdits('insert-nas-image', [{
          range: new monacoNs.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: textToInsert,
        }]);
      }
    }
    setShowNASSelector(false);
  }, []);

  /**
   * 編輯器掛載完成時的回調
   */
  const handleEditorDidMount = useCallback(
    (editor: editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      textHelperRef.current = new MonacoTextHelper(editor);
      setIsEditorReady(true);

      /**
       * 計算字形數量（使用者感知的字元）
       */
      const countGraphemes = (text: string): number => {
        if (!text) return 0;
        const normalized = text.replace(/\r\n/g, '\n');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Seg = (Intl as any).Segmenter;
        if (Seg) {
          try {
            const seg = new Seg(undefined, { granularity: 'grapheme' });
            let count = 0;
            for (const _ of seg.segment(normalized)) count++;
            return count;
          } catch (e) {
            // fallback
          }
        }
        return Array.from(normalized).length;
      };

      /**
       * 智慧計算單字數量
       */
      const countWords = (text: string): number => {
        if (!text) return 0;

        const hasCJK =
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
        if (hasCJK) {
          const hanMatches = text.match(/\p{Script=Han}/gu) || [];
          const hiraganaMatches = text.match(/\p{Script=Hiragana}/gu) || [];
          const katakanaMatches = text.match(/\p{Script=Katakana}/gu) || [];
          const cjkCount =
            hanMatches.length + hiraganaMatches.length + katakanaMatches.length;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Seg = (Intl as any).Segmenter;
          if (Seg) {
            try {
              const seg = new Seg(undefined, { granularity: 'word' });
              let count = 0;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const segment of seg.segment(text) as any) {
                if (segment.isWordLike) count++;
              }
              if (count > 0) return count;
            } catch (e) {
              // fallback
            }
          }
        }

        const other = text.match(/\p{L}+/gu) || [];
        return other.length;
      };

      /**
       * 更新所有統計數據
       */
      const updateAllStats = () => {
        try {
          const model = editor.getModel();
          if (!model) return;
          const value = model.getValue();
          setTotalChars(countGraphemes(value));
          setTotalLines(model.getLineCount());
          setTotalWords(countWords(value));
        } catch (e) {
          // ignore
        }
      };

      /**
       * 更新選取範圍的統計數據
       */
      const updateSelectionStats = () => {
        try {
          const selection = editor.getSelection();
          const model = editor.getModel();
          if (!model || !selection) {
            setSelChars(0);
            setSelLines(0);
            setSelWords(0);
            return;
          }

          const selectedText = model.getValueInRange(selection) || '';
          setSelChars(countGraphemes(selectedText));
          setSelLines(
            selectedText ? selectedText.split(/\r\n|\r|\n/).length : 0
          );
          setSelWords(countWords(selectedText));
        } catch (e) {
          // ignore
        }
      };

      // 初始更新
      updateAllStats();
      updateSelectionStats();

      // 訂閱事件
      const contentDisposable = editor.onDidChangeModelContent(() => {
        updateAllStats();
        updateSelectionStats();
      });

      const selectionDisposable = editor.onDidChangeCursorSelection(() => {
        updateSelectionStats();
      });

      disposablesRef.current.push(contentDisposable, selectionDisposable);

      // 監聽 Paste 事件 — 使用 capture 以優先攔截圖片貼上
      const domNode = editor.getContainerDomNode();
      const pasteHandler = async (e: ClipboardEvent) => {
        if (!e.clipboardData) return;

        // 先檢查焦點是否在 editor 範圍內
        const activeEl = document.activeElement;
        if (!domNode.contains(activeEl)) return;

        // 檢查是否有圖片檔案
        let imageFile: File | null = null;
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          if (e.clipboardData.files[i].type.startsWith('image/')) {
            imageFile = e.clipboardData.files[i];
            break;
          }
        }
        // 也檢查 items (某些瀏覽器用 items 而非 files)
        if (!imageFile && e.clipboardData.items) {
          for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            if (item.type.startsWith('image/')) {
              imageFile = item.getAsFile();
              break;
            }
          }
        }
        if (!imageFile) return;

        e.preventDefault();
        e.stopPropagation();

        try {
          // 壓縮圖片到 max 1024px
          const bitmap = await createImageBitmap(imageFile);
          const MAX = 1024;
          let w = bitmap.width, h = bitmap.height;
          if (w > MAX || h > MAX) {
            const ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = new OffscreenCanvas(w, h);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0, w, h);
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
          bitmap.close();

          // Upload to Server
          const formData = new FormData();
          formData.append('file', blob, imageFile.name.replace(/\.[^/.]+$/, "") + ".webp");

          const token = localStorage.getItem('adminToken');
          const res = await fetch('/api/admin/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Upload failed');
          }

          const data = await res.json();
          const imageUrl = data.url; // e.g., /uploads/2023/10/xyz.webp

          // 插入 markdown 圖片
          const position = editor.getPosition();
          if (position) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const monacoNs = (window as any).monaco;
            if (monacoNs) {
              editor.executeEdits('paste-image', [{
                range: new monacoNs.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: `![image](${imageUrl})\n`,
              }]);
            }
          }
        } catch (err: any) {
          console.error('Paste/Upload image error:', err);
          alert('圖片上傳失敗: ' + err.message);
        }
      };

      // 使用 capture: true 讓事件在 capture 階段就被攔截，優先於 Monaco 的 handler
      window.addEventListener('paste', pasteHandler, true);

      // 添加到 cleanup
      disposablesRef.current.push({
        dispose: () => window.removeEventListener('paste', pasteHandler, true)
      });
    },
    []
  );

  // 清理工作
  useEffect(() => {
    return () => {
      setIsEditorReady(false);
      editorRef.current = null;
      textHelperRef.current = null;
      disposablesRef.current.forEach(
        (d) => d && typeof d.dispose === 'function' && d.dispose()
      );
      disposablesRef.current = [];
    };
  }, []);

  /**
   * 處理粗體格式切換
   */
  const handleBold = useCallback(() => {
    textHelperRef.current?.applyBold();
  }, []);

  /**
   * 處理斜體格式切換
   */
  const handleItalic = useCallback(() => {
    textHelperRef.current?.applyItalic();
  }, []);

  /**
   * 處理連結格式插入
   */
  const handleLink = useCallback(() => {
    textHelperRef.current?.insertLink();
  }, []);

  /**
   * 處理圖片格式插入
   */
  const handleImage = useCallback(() => {
    textHelperRef.current?.insertImage();
  }, []);

  /**
   * 處理復原動作
   */
  const handleUndo = useCallback(() => {
    editorRef.current?.trigger('app', 'undo', null);
  }, []);

  /**
   * 處理取消復原動作
   */
  const handleRedo = useCallback(() => {
    editorRef.current?.trigger('app', 'redo', null);
  }, []);

  // 註冊快捷鍵
  useMonacoShortcuts({
    editor: editorRef.current,
    onBold: handleBold,
    onItalic: handleItalic,
    onLink: handleLink,
    onImage: handleImage,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    fontSize: 14,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    minimap: { enabled: true },
    automaticLayout: true,
    wordWrap: 'on',
    renderLineHighlight: 'gutter',
    selectOnLineNumbers: true,
    matchBrackets: 'always',
    contextmenu: true,
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'never',
      seedSearchStringFromSelection: 'always',
    },
    accessibilitySupport: 'auto',
    renderWhitespace: 'selection',
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    cursorBlinking: 'blink',
    mouseWheelZoom: true,
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    formatOnType: true,
    ...options,
  };

  return (
    <div className="monaco-editor-glass overflow-hidden">
      {showToolbar && (
        <MonacoToolbar
          onBold={handleBold}
          onItalic={handleItalic}
          onLink={handleLink}
          onImage={handleImage}
          onNAS={handleNAS}
          onUndo={handleUndo}
          onRedo={handleRedo}
          disabled={!isEditorReady}
        />
      )}

      {ReactDOM.createPortal(
        <PhotoSelectorModal
          isOpen={showNASSelector}
          onClose={() => setShowNASSelector(false)}
          onSelect={handleNASSelect}
        />,
        document.body
      )}

      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        theme={theme}
        options={defaultOptions}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">載入編輯器中...</div>
          </div>
        }
      />

      {/* 狀態欄 - 玻璃擬態 */}
      <div className="monaco-statusbar-glass px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground/80">
          總字數: {totalWords} · 總字元: {totalChars} · 總行數: {totalLines}
        </div>

        <div className="text-muted-foreground/80">
          選取 — 字數: {selWords} · 字元: {selChars} · 行數: {selLines}
        </div>
      </div>
    </div>
  );
}
