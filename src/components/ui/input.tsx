import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      // 後台面板裡那種半透明的輸入框。原本每個呼叫點各寫一次 bg-accent/20 border-border/40…
      variant: {
        default: '',
        glass: 'bg-accent/20 border-border/40 text-foreground/80 placeholder:text-muted-foreground/40',
      },
      // ⚠️ compact 是 text-sm 不是 text-xs。原本呼叫點寫 `h-8 text-xs`，但基底的
      //    `md:text-sm` 是另一個 variant、蓋不掉，所以那些輸入框在桌機上**一直是 14px**。
      //    這裡照實際畫出來的樣子定義；要真的改成 12px 是設計決定，不是重構。
      size: {
        default: 'h-10 text-base md:text-sm',
        sm: 'h-9 text-sm',
        compact: 'h-8 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Input({
  className,
  type,
  variant,
  size,
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return <input type={type} className={cn(inputVariants({ variant, size }), className)} {...props} />;
}

export { Input };
