import {
  Bold,
  Italic,
  Link,
  Image,
  CornerUpLeft,
  CornerUpRight,
  HardDrive,
  Upload,
  FileText,
  Terminal,
} from 'lucide-react';
import { BusyDot } from '@/components/admin/AdminLoading';
import type { MonacoToolbarProps } from './types';

/**
 * Monaco 編輯器工具欄組件。樣式在 monaco-editor.css：一排細線圖示鈕，滑過變實墨，
 * Vim 開著時那顆底下一條墨線（aria-pressed）。
 */
export function MonacoToolbar({
  onBold,
  onItalic,
  onLink,
  onImage,
  onNAS,
  onUpload,
  onUndo,
  onRedo,
  onLinkPost,
  onVimToggle,
  vimMode = false,
  disabled = false,
  uploading = false,
}: MonacoToolbarProps) {
  return (
    <div className="monaco-toolbar">
      <button type="button" className="monaco-tool" onClick={onUndo} disabled={disabled} title="復原 (Ctrl+Z)">
        <CornerUpLeft className="size-3.5" />
      </button>
      <button type="button" className="monaco-tool" onClick={onRedo} disabled={disabled} title="取消復原 (Ctrl+Y)">
        <CornerUpRight className="size-3.5" />
      </button>

      <span className="monaco-sep" aria-hidden="true" />

      <button type="button" className="monaco-tool" onClick={onBold} disabled={disabled} title="切換粗體 (Ctrl+B)">
        <Bold className="size-3.5" />
      </button>
      <button type="button" className="monaco-tool" onClick={onItalic} disabled={disabled} title="切換斜體 (Ctrl+I)">
        <Italic className="size-3.5" />
      </button>

      <span className="monaco-sep" aria-hidden="true" />

      <button type="button" className="monaco-tool" onClick={onLink} disabled={disabled} title="切換連結 (Ctrl+K)">
        <Link className="size-3.5" />
      </button>
      {onLinkPost && (
        <button
          type="button"
          className="monaco-tool"
          onClick={onLinkPost}
          disabled={disabled}
          title="插入舊文章連結 (Cmd/Ctrl+Shift+K)"
        >
          <FileText className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="monaco-tool"
        onClick={onImage}
        disabled={disabled}
        title="插入圖片 (Ctrl+Shift+G)"
      >
        <Image className="size-3.5" />
      </button>
      <button type="button" className="monaco-tool" onClick={onNAS} disabled={disabled} title="從 NAS 插入圖片">
        <HardDrive className="size-3.5" />
      </button>
      <button
        type="button"
        className="monaco-tool"
        onClick={onUpload}
        disabled={disabled || uploading}
        title="上傳圖片檔案"
      >
        {uploading ? <BusyDot /> : <Upload className="size-3.5" />}
      </button>

      {onVimToggle && (
        <>
          <span className="monaco-sep" aria-hidden="true" />
          <button
            type="button"
            className="monaco-tool"
            onClick={onVimToggle}
            disabled={disabled}
            aria-pressed={vimMode}
            title={vimMode ? 'Vim 模式：開（點擊關閉）' : 'Vim 模式：關（點擊開啟）'}
          >
            <Terminal className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
