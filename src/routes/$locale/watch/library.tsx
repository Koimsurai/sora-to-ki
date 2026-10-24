import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的片庫頁：看過的全部現在是收藏頁「在看」那一區的封面牆
export const Route = createFileRoute('/$locale/watch/library')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$locale/watch', params: { locale: params.locale }, hash: 'watch', statusCode: 301 });
  },
});
