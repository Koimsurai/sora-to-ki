import { useState } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale';
import { format, isValid, parse } from 'date-fns';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { adminLang, at } from '@/i18n/admin-i18n';
import { normalizeDate, normalizeTime } from './adminFormat';
import './AdminFields.css';

// 後台的表單零件：下拉、日期、時間。換掉瀏覽器原生的 <select>、<input type="date"> 與
// datetime-local——那三個展開後的選單與月曆是瀏覽器畫的，白底、圓角、系統字，CSS 改不到。
// 外觀跟 .adm-prompt 同一套：細框、直角、等寬字給日期與數字，琥珀只給選中的那一個。

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * 下拉選單。觸發的那顆長得跟旁邊的輸入框一樣（可以直接放進 .adm-prompt 或 .adm-field），
 * 展開的清單是夜色底、細框、直角，選中的那項前面一顆琥珀勾。
 */
export function AdminSelect({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** 報讀器念的名字（畫面上的標籤在外面） */
  label: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger className="adm-select" aria-label={label}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="adm-select-icon">
          <ChevronDown aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="adm-select-menu" position="popper" sideOffset={4} align="start">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="adm-select-item">
                <SelectPrimitive.ItemIndicator className="adm-select-check">
                  <Check aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** parse 要一個參考日期補缺的欄位；格式是完整的年月日，所以給哪天都一樣（固定一個，render 才是純的） */
const PARSE_REF = new Date(2000, 0, 1);

/** 月曆的月份與星期名跟著後台語言 */
const DATE_LOCALES = { 'zh-TW': zhTW, 'zh-CN': zhCN, en: enUS, ja, ko } as const;

/** 字串欄位：打字時照打，離開欄位才整理成標準寫法；認不得就還原 */
function useDraft(value: string, normalize: (text: string) => string | null, onChange: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = normalize(draft);
    if (next !== null && next !== value) onChange(next);
    setDraft(null);
  };
  return { text: draft ?? value, setDraft, commit };
}

/**
 * 日期：可以直接打（2026-10-26），也可以按右邊的月曆挑。值是 `yyyy-MM-dd` 或空字串。
 */
export function AdminDateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const { text, setDraft, commit } = useDraft(value, normalizeDate, onChange);
  const selected = value ? parse(value, 'yyyy-MM-dd', PARSE_REF) : undefined;
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <span className="adm-datefield">
        <input
          className="adm-datefield-input"
          aria-label={label}
          value={text}
          placeholder="yyyy-mm-dd"
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <PopoverPrimitive.Trigger className="adm-datefield-btn" aria-label={at('common.openCalendar', { label })}>
          <CalendarDays aria-hidden="true" />
        </PopoverPrimitive.Trigger>
      </span>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="adm-cal-pop" sideOffset={4} align="end">
          <DayPicker
            mode="single"
            locale={DATE_LOCALES[adminLang()]}
            selected={selected && isValid(selected) ? selected : undefined}
            defaultMonth={selected && isValid(selected) ? selected : undefined}
            onSelect={(d) => {
              if (d) onChange(format(d, 'yyyy-MM-dd'));
              setOpen(false);
            }}
            showOutsideDays
            classNames={CAL_CLASSES}
            components={{ Chevron: CalChevron }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** 時間：24 小時制，打 `HH:mm`（930、9:30 也收）。值是 `HH:mm` 或空字串 */
export function AdminTimeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { text, setDraft, commit } = useDraft(value, normalizeTime, onChange);
  return (
    <span className="adm-datefield adm-timefield">
      <input
        className="adm-datefield-input"
        aria-label={label}
        value={text}
        placeholder="HH:mm"
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </span>
  );
}

const CAL_CLASSES = {
  root: 'adm-cal',
  months: 'adm-cal-months',
  month: 'adm-cal-month',
  month_caption: 'adm-cal-caption',
  caption_label: 'adm-cal-caption-label',
  nav: 'adm-cal-nav',
  button_previous: 'adm-cal-navbtn',
  button_next: 'adm-cal-navbtn',
  month_grid: 'adm-cal-grid',
  weekdays: 'adm-cal-weekdays',
  weekday: 'adm-cal-weekday',
  week: 'adm-cal-week',
  day: 'adm-cal-day',
  day_button: 'adm-cal-daybtn',
  selected: 'adm-cal-selected',
  today: 'adm-cal-today',
  outside: 'adm-cal-outside',
  disabled: 'adm-cal-disabled',
  hidden: 'adm-cal-hidden',
  chevron: 'adm-cal-chevron',
};

function CalChevron({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) {
  return orientation === 'left' ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />;
}
