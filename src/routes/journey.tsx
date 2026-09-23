import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊 /journey 已併入 /about 的「成長軌跡」section。
export const Route = createFileRoute('/journey')({
  beforeLoad: () => {
    // `to` + `hash` 而不是 `href`：client 預載追 redirect 時不認 href，會自己轉向自己卡死頁面
    // （見 routes/blog/$id.tsx）。
    throw redirect({ to: '/about', hash: 'journey' });
  },
});
