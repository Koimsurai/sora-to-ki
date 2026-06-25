import * as React from 'react';
import { useInView } from 'framer-motion';

type UseInViewOpts = NonNullable<Parameters<typeof useInView>[1]>;

export interface UseIsInViewOptions {
  inView?: boolean;
  inViewOnce?: boolean;
  inViewMargin?: UseInViewOpts['margin'];
}

function useIsInView<T extends HTMLElement | SVGElement = HTMLElement>(
  ref: React.Ref<T>,
  options: UseIsInViewOptions = {},
) {
  const { inView, inViewOnce = false, inViewMargin = '0px' } = options;
  const localRef = React.useRef<T>(null);
  React.useImperativeHandle(ref, () => localRef.current!);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;
  return { ref: localRef, isInView };
}

export { useIsInView };
