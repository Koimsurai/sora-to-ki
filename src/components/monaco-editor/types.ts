import type { editor } from 'monaco-editor';

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

export const TEXT_ACTIONS: Record<string, TextAction> = {
  bold: {
    before: '**',
    after: '**',
    placeholder: '粗體文字',
  },
  italic: {
    before: '*',
    after: '*',
    placeholder: '斜體文字',
  },
  link: {
    before: '[',
    after: '](url)',
    placeholder: '連結文字',
  },
  image: {
    before: '![',
    after: '](image-url)',
    placeholder: '圖片描述',
  },
};
