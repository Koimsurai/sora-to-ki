import { createFileRoute, redirect } from '@tanstack/react-router';

// 舊 /journey 已併入 /about 的「成長軌跡」section。
export const Route = createFileRoute('/journey')({
  beforeLoad: () => {
    throw redirect({ href: '/about#journey' });
  },
});
