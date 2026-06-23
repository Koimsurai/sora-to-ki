import { useState, useEffect, useRef } from 'react';

interface UseInViewOptions {
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
}

/**
 * useInView Hook - 使用 Intersection Observer API 檢測元素是否進入可視區域
 * @returns [ref, isInView, entry]
 */
export const useInView = <T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
  triggerOnce = false,
) => {
  const [isInView, setIsInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const elementRef = useRef<T | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // 預設選項
    const defaultOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: '50px', // 提前 50px 開始載入
      threshold: 0.1,
      ...options,
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const [obsEntry] = entries;
        setEntry(obsEntry);

        if (obsEntry.isIntersecting) {
          setIsInView(true);
          // 如果只觸發一次，則在進入可視區域後停止觀察
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      defaultOptions,
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [options.root, options.rootMargin, options.threshold, triggerOnce]);

  return [elementRef, isInView, entry] as const;
};

/**
 * useInViewOnce Hook - 元素進入可視區域後只觸發一次
 * @returns [ref, hasBeenInView]
 */
export const useInViewOnce = <T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
) => {
  return useInView<T>(options, true);
};
