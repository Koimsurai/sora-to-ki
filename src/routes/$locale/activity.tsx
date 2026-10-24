import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的動態頁已併進航行日誌（/history）
export const Route = createFileRoute('/$locale/activity')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$locale/history', params: { locale: params.locale }, statusCode: 301 });
  },
});
