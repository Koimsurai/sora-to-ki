import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold,
  Italic,
  Link,
  Image,
  CornerUpLeft,
  CornerUpRight,
  HardDrive,
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
  onUndo,
  onRedo,
  disabled = false,
}: MonacoToolbarProps) {
  return (
    <div className="monaco-toolbar-glass flex items-center gap-1 p-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={disabled}
          title="復原 (Ctrl+Z)"
          className="h-8 w-8 p-0"
        >
          <CornerUpLeft className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={disabled}
          title="取消復原 (Ctrl+Y / Ctrl+Shift+Z)"
          className="h-8 w-8 p-0"
        >
          <CornerUpRight className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBold}
          disabled={disabled}
          title="切換粗體 (Ctrl+B)"
          className="h-8 w-8 p-0"
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onItalic}
          disabled={disabled}
          title="切換斜體 (Ctrl+I)"
          className="h-8 w-8 p-0"
        >
          <Italic className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLink}
          disabled={disabled}
          title="切換連結 (Ctrl+K)"
          className="h-8 w-8 p-0"
        >
          <Link className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onImage}
          disabled={disabled}
          title="插入圖片 (Ctrl+Shift+G)"
          className="h-8 w-8 p-0"
        >
          <Image className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onNAS}
          disabled={disabled}
          title="從 NAS 插入圖片"
          className="h-8 w-8 p-0"
        >
          <HardDrive className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
