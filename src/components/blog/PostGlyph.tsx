// 每篇文章自己的星座：用 slug 當種子長出幾顆星、連成一個小星座，當封面。
// 不用找圖，同一篇永遠長一樣（SSR 與 client 也一樣，沒有 hydration 差異）。
import { useMemo } from 'react';

function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export default function PostGlyph({ seed, className }: { seed: string; className?: string }) {
  const g = useMemo(() => {
    const R = seeded(seed);
    const n = 6 + Math.floor(R() * 5);
    const pts: { x: number; y: number; m: number }[] = [];
    let x = 70 + R() * 60;
    let y = 160 + R() * 80;
    for (let i = 0; i < n; i++) {
      pts.push({ x, y, m: Math.pow(R(), 1.6) });
      const ang = (R() - 0.5) * 2.2;
      const step = 28 + R() * 34;
      x = Math.min(350, Math.max(50, x + Math.cos(ang) * step));
      y = Math.min(255, Math.max(145, y + Math.sin(ang) * step * 0.9));
    }
    // 每顆新星連到離它最近的舊星；線在星的周圍留一點空隙（星圖的畫法）
    const lines = pts.slice(1).map((q, i) => {
      let best = pts[0];
      let bd = Infinity;
      for (const p of pts.slice(0, i + 1)) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const len = Math.hypot(q.x - best.x, q.y - best.y) || 1;
      const gap = 6;
      return {
        x1: r1(best.x + ((q.x - best.x) / len) * gap),
        y1: r1(best.y + ((q.y - best.y) / len) * gap),
        x2: r1(q.x - ((q.x - best.x) / len) * gap),
        y2: r1(q.y - ((q.y - best.y) / len) * gap),
      };
    });
    const dust = Array.from({ length: 60 }, () => ({
      x: r1(R() * 400),
      y: r1(R() * 400),
      r: r1(0.4 + Math.pow(R(), 3) * 1.1),
      o: r1(0.2 + R() * 0.5),
    }));
    return { pts, lines, dust };
  }, [seed]);

  return (
    <svg className={className} viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {g.dust.map((s, i) => (
        <circle key={`d${i}`} cx={s.x} cy={s.y} r={s.r} fill="#dfe5f2" opacity={s.o} />
      ))}
      {g.lines.map((l, i) => (
        <line key={`l${i}`} {...l} stroke="#e9c17a" strokeOpacity={0.55} strokeWidth={0.8} />
      ))}
      {g.pts.map((p, i) => (
        <g key={`p${i}`}>
          <circle cx={r1(p.x)} cy={r1(p.y)} r={r1(5 + p.m * 9)} fill="#f3e2bd" opacity={0.12} />
          <circle cx={r1(p.x)} cy={r1(p.y)} r={r1(1.3 + p.m * 2.4)} fill="#f6efe0" />
        </g>
      ))}
    </svg>
  );
}
