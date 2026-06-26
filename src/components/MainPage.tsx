import NebulaBackground from './NebulaBackground';
import Hero from './Hero';
import TransitionAnimation from './TransitionAnimation';
import HomeLately from './HomeLately';

// 首頁內容（對齊舊 App.tsx 的 MainPage）：Hero →（過場動畫）→ Lately（含軌跡與訊號收尾）。
// section id 供導覽列 hash 跳轉（#home / #lately / #contact）。Header 的 active 已改 path-based,不需 onSectionChange。
// 全部 SSR-safe（window/document 僅在 useEffect 內）→ 直接 import 讓內容進 SSR HTML(SEO)。
export default function MainPage() {
  return (
    <>
      <NebulaBackground />
      <main>
        <section id="home">
          <Hero />
        </section>
        <TransitionAnimation />
        <section id="lately">
          <HomeLately />
        </section>
      </main>
    </>
  );
}
