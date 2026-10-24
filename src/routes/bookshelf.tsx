import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的書櫃頁已併進收藏（/watch）的「書櫃」那一區
export const Route = createFileRoute('/bookshelf')({
  beforeLoad: () => {
    // `to` + `hash` 而不是 `href`：client 預載追 redirect 時不認 href（見 routes/journey.tsx）
    throw redirect({ to: '/watch', hash: 'books', statusCode: 301 });
  },
});
