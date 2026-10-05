import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const labelVariants = cva('font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', {
  variants: {
    // xs：分類／標籤編輯器裡逐語系的子欄位（原本在呼叫點寫 text-xs）。
    size: { default: 'text-sm', xs: 'text-xs' },
  },
  defaultVariants: { size: 'default' },
});

function Label({
  className,
  size,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return <LabelPrimitive.Root className={cn(labelVariants({ size }), className)} {...props} />;
}

export { Label };
