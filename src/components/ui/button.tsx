import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // 後台工具列那種「淡邊框」按鈕。原本是 outline 再於呼叫點覆寫成這組，6 處幾乎一字不差。
        subtle:
          'border border-border/50 bg-background text-foreground/70 hover:bg-accent/40 hover:text-accent-foreground',
      },
      // compact / xs 是後台的緊湊尺寸——後台的按鈕幾乎從不用 default（h-10），
      // 而是在每個呼叫點手動壓成 h-8 / h-7 + text-xs，同一組 class 抄了二十幾次。
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        compact: 'h-8 rounded-md px-3 text-xs gap-1.5',
        xs: 'h-7 rounded-md px-3 text-xs gap-1',
      },
      // 動作的語意色（搭 ghost 用）：留言審核那排「批准／垃圾／丟棄／回覆／編輯／封鎖／刪除」。
      // 放在 variant 之後，tailwind-merge 才會讓它蓋過 ghost 的 hover 色。
      tone: {
        none: '',
        success: 'text-green-400 hover:text-green-300 hover:bg-green-400/10',
        danger: 'text-red-400 hover:text-red-300 hover:bg-red-400/10',
        destructive: 'text-red-500 hover:text-red-400 hover:bg-red-500/10',
        neutral: 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-400/10',
        accent: 'text-purple-400 hover:text-purple-300 hover:bg-purple-400/10',
        info: 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10',
        caution: 'text-orange-400 hover:text-orange-300 hover:bg-orange-400/10',
        muted: 'text-muted-foreground hover:text-foreground/80',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      tone: 'none',
    },
  },
);

// ComponentProps<"button"> 而非 ButtonHTMLAttributes：前者含 ref。
// 這個元件不再是 forwardRef（React 19 ref 是一般 prop），型別若停在
// HTMLAttributes，呼叫端就無法傳 ref——runtime 能動但 tsc 會擋。
export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, tone, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, tone, className }))} {...props} />;
}

export { Button, buttonVariants };
