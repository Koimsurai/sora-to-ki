import type { editor } from 'monaco-editor';
import { at } from '@/i18n/admin-i18n';

export interface MonacoEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  language?: string;
  theme?: string;
  height?: string;
  options?: editor.IStandaloneEditorConstructionOptions;
  onSave?: () => void;
  showToolbar?: boolean;
  path?: string;
}

export interface MonacoToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onLink: () => void;
  onImage: () => void;
  onNAS: () => void;
  onUpload: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onLinkPost?: () => void;
  onVimToggle?: () => void;
  vimMode?: boolean;
  disabled?: boolean;
  uploading?: boolean;
}

export interface MonacoShortcutsProps {
  editor: editor.IStandaloneCodeEditor | null;
  onBold: () => void;
  onItalic: () => void;
  onLink: () => void;
  onImage: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export interface TextAction {
  before: string;
  after?: string;
  placeholder?: string;
}

// placeholder 是 getter：插入的那一刻才照後台語言取字（模組載入時語系檔可能還沒好，之後也可能換語言）
export const TEXT_ACTIONS: Record<string, TextAction> = {
  bold: {
    before: '**',
    after: '**',
    get placeholder() {
      return at('monaco.placeholder.bold');
    },
  },
  italic: {
    before: '*',
    after: '*',
    get placeholder() {
      return at('monaco.placeholder.italic');
    },
  },
  link: {
    before: '[',
    after: '](url)',
    get placeholder() {
      return at('monaco.placeholder.link');
    },
  },
  image: {
    before: '![',
    after: '](image-url)',
    get placeholder() {
      return at('monaco.placeholder.image');
    },
  },
};
