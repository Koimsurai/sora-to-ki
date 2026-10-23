import HomeOrbit from './HomeOrbit';

// 首頁（2026-10 翻新）：只有門面——繞著土星的五顆衛星，滑過才浮出名字與最新一則。
// 門面不放更多東西，各分區的內容到各自的頁面去看。
// 這裡刻意**不是** <main>：AppShell 已經把整頁內容包在一個 <main> 裡了，巢狀的 main 會讓
// 螢幕閱讀器拿到兩個「主要內容」地標。
export default function MainPage() {
  return <HomeOrbit />;
}
