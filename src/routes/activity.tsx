import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊的動態頁已併進航行日誌（/history）
export const Route = createFileRoute('/activity')({
  beforeLoad: () => {
    throw redirect({ to: '/history', statusCode: 301 });
  },
});
