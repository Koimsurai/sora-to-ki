import React from 'react';
import {
  Bold,
  Italic,
  Link,
  Image,
  CornerUpLeft,
  CornerUpRight,
  HardDrive,
  Upload,
  Loader2,
} from 'lucide-react';
import { MonacoToolbarProps } from './types';

/**
 * Monaco 編輯器工具欄組件
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
  disabled = false,
  uploading = false,
}: MonacoToolbarProps) {
  const btnClass =
    'size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground/80 hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className="monaco-toolbar-glass flex items-center gap-0.5 px-2 py-1.5">
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onUndo} disabled={disabled} title="復原 (Ctrl+Z)" className={btnClass}>
          <CornerUpLeft className="size-3.5" />
        </button>
        <button type="button" onClick={onRedo} disabled={disabled} title="取消復原 (Ctrl+Y)" className={btnClass}>
          <CornerUpRight className="size-3.5" />
        </button>
      </div>

      <div className="h-4 mx-1.5 w-px bg-border/50" />

      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onBold} disabled={disabled} title="切換粗體 (Ctrl+B)" className={btnClass}>
          <Bold className="size-3.5" />
        </button>
        <button type="button" onClick={onItalic} disabled={disabled} title="切換斜體 (Ctrl+I)" className={btnClass}>
          <Italic className="size-3.5" />
        </button>
      </div>

      <div className="h-4 mx-1.5 w-px bg-border/50" />

      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onLink} disabled={disabled} title="切換連結 (Ctrl+K)" className={btnClass}>
          <Link className="size-3.5" />
        </button>
        <button type="button" onClick={onImage} disabled={disabled} title="插入圖片 (Ctrl+Shift+G)" className={btnClass}>
          <Image className="size-3.5" />
        </button>
        <button type="button" onClick={onNAS} disabled={disabled} title="從 NAS 插入圖片" className={btnClass}>
          <HardDrive className="size-3.5" />
        </button>
        <button type="button" onClick={onUpload} disabled={disabled || uploading} title="上傳圖片檔案" className={btnClass}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
