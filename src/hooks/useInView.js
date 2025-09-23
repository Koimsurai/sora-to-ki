import { useState, useEffect, useRef } from 'react';

/**
 * useInView Hook - 使用 Intersection Observer API 檢測元素是否進入可視區域
 * @param {Object} options - Intersection Observer 選項
 * @param {boolean} triggerOnce - 是否只觸發一次
 * @returns {Array} [ref, isInView, entry] - 元素引用、是否可見、觀察項目
 */
export const useInView = (options = {}, triggerOnce = false) => {
  const [isInView, setIsInView] = useState(false);
  const [entry, setEntry] = useState(null);
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // 預設選項
    const defaultOptions = {
      root: null,
      rootMargin: '50px', // 提前 50px 開始載入
      threshold: 0.1,
      ...options
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setEntry(entry);
        
        if (entry.isIntersecting) {
          setIsInView(true);
          // 如果只觸發一次，則在進入可視區域後停止觀察
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      defaultOptions
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [options.root, options.rootMargin, options.threshold, triggerOnce]);

  return [elementRef, isInView, entry];
};

/**
 * useInViewOnce Hook - 元素進入可視區域後只觸發一次
 * @param {Object} options - Intersection Observer 選項
 * @returns {Array} [ref, hasBeenInView] - 元素引用、是否曾經可見
 */
export const useInViewOnce = (options = {}) => {
  return useInView(options, true);
};