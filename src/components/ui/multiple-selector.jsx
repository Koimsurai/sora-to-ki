import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function MultipleSelector({
  options = [],
  value = [],
  onChange,
  placeholder = '選擇選項...',
  emptyIndicator = <p className="text-center text-sm text-muted-foreground">沒有找到結果</p>,
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(value);

  React.useEffect(() => {
    setSelected(value);
  }, [value]);

  const handleSelect = (option) => {
    const newSelected = selected.some((item) => item.value === option.value)
      ? selected.filter((item) => item.value !== option.value)
      : [...selected, option];
    
    setSelected(newSelected);
    onChange?.(newSelected);
  };

  const handleRemove = (option) => {
    const newSelected = selected.filter((item) => item.value !== option.value);
    setSelected(newSelected);
    onChange?.(newSelected);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-start"
          >
            {selected.length > 0 ? `已選擇 ${selected.length} 項` : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="搜尋..." />
            <CommandEmpty>{emptyIndicator}</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {options.map((option) => {
                const isSelected = selected.some((item) => item.value === option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleSelect(option)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span>{option.label}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="gap-1"
            >
              {option.label}
              <button
                type="button"
                onClick={() => handleRemove(option)}
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
