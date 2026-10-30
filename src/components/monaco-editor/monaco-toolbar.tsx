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
import { useAdminT } from '@/i18n/admin-i18n';
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
  const { t } = useAdminT();
  return (
    <div className="monaco-toolbar">
      <button
        type="button"
        className="monaco-tool"
        onClick={onUndo}
        disabled={disabled}
        title={t('monaco.toolbar.undo')}
      >
        <CornerUpLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className="monaco-tool"
        onClick={onRedo}
        disabled={disabled}
        title={t('monaco.toolbar.redo')}
      >
        <CornerUpRight className="size-3.5" />
      </button>

      <span className="monaco-sep" aria-hidden="true" />

      <button
        type="button"
        className="monaco-tool"
        onClick={onBold}
        disabled={disabled}
        title={t('monaco.toolbar.bold')}
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        className="monaco-tool"
        onClick={onItalic}
        disabled={disabled}
        title={t('monaco.toolbar.italic')}
      >
        <Italic className="size-3.5" />
      </button>

      <span className="monaco-sep" aria-hidden="true" />

      <button
        type="button"
        className="monaco-tool"
        onClick={onLink}
        disabled={disabled}
        title={t('monaco.toolbar.link')}
      >
        <Link className="size-3.5" />
      </button>
      {onLinkPost && (
        <button
          type="button"
          className="monaco-tool"
          onClick={onLinkPost}
          disabled={disabled}
          title={t('monaco.toolbar.linkPost')}
        >
          <FileText className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className="monaco-tool"
        onClick={onImage}
        disabled={disabled}
        title={t('monaco.toolbar.image')}
      >
        <Image className="size-3.5" />
      </button>
      <button type="button" className="monaco-tool" onClick={onNAS} disabled={disabled} title={t('monaco.toolbar.nas')}>
        <HardDrive className="size-3.5" />
      </button>
      <button
        type="button"
        className="monaco-tool"
        onClick={onUpload}
        disabled={disabled || uploading}
        title={t('monaco.toolbar.upload')}
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
            title={vimMode ? t('monaco.toolbar.vimOn') : t('monaco.toolbar.vimOff')}
          >
            <Terminal className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
