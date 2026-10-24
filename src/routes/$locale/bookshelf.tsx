import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的書櫃頁已併進收藏（/watch）的「書櫃」那一區
export const Route = createFileRoute('/$locale/bookshelf')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$locale/watch', params: { locale: params.locale }, hash: 'books', statusCode: 301 });
  },
});
