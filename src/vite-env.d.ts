/// <reference types="vite/client" />

// Swiper 的 CSS 副作用 import 沒有型別宣告，補上避免 tsc 報 TS2882
declare module 'swiper/css';
declare module 'swiper/css/*';
