import { Suspense, type ReactNode, type CSSProperties } from 'react';
import { useInViewOnce } from '../hooks/useInView';
import './LazyComponent.css';

interface LazyComponentProps {
  children?: ReactNode;
  fallback?: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * LazyComponent - 延遲載入組件的包裝器
 * 只有當組件進入可視區域時才會載入和渲染
 */
const LazyComponent = ({
  children,
  fallback = <div className="lazy-loading">載入中...</div>,
  placeholder = null,
  rootMargin = '100px',
  threshold = 0.1,
  className = '',
  style = {},
}: LazyComponentProps) => {
  const [ref, hasBeenInView] = useInViewOnce({
    rootMargin,
    threshold,
  });

  return (
    <div
      ref={ref}
      className={`lazy-component-wrapper ${className}`}
      style={style}
    >
      {hasBeenInView ? (
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      ) : (
        placeholder ?? <div className="lazy-placeholder">正在準備載入...</div>
      )}
    </div>
  );
};

export default LazyComponent;
