import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的音樂頁已併進收藏（/watch）的「在聽」那一區
export const Route = createFileRoute('/$locale/music')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$locale/watch', params: { locale: params.locale }, hash: 'music', statusCode: 301 });
  },
});
