import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的片庫頁：看過的全部現在是收藏頁「在看」那一區的封面牆
export const Route = createFileRoute('/watch/library')({
  beforeLoad: () => {
    // `to` + `hash` 而不是 `href`：client 預載追 redirect 時不認 href（見 routes/journey.tsx）
    throw redirect({ to: '/watch', hash: 'watch', statusCode: 301 });
  },
});
