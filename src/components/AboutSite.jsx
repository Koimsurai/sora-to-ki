import React from 'react';
import InfoPage from './InfoPage';
import { LinkCard } from './BlogPost';

function AboutSite() {
  return (
    <InfoPage
      title="此站點"
      subtitle="一個工程師的個人空間"
      slug="about-site"
      prev={null}
      next={{ to: '/history', title: '歷史 — 站點走過的路' }}
    >
      <p>
        此站點是我用來記錄技術與生活的個人網站，從 2025 年 4 月起持續寫到現在。
      </p>

      <h2 id="qa">常見問題 Q&amp;A</h2>

      <h3 id="q1">1. 建立此站點的初衷？</h3>
      <p>
        最初架設這個網站，是為了在找實習時能有個地方展示自己的技術棧與開發能力。
        結果找實習時並沒有真正派上用場，反而是現在的同事偶爾會來看我的網站。
      </p>

      <h3 id="q2">2. 網站的技術棧？</h3>
      <p>
        前端採用 <code>React 19</code> 搭配 <code>Vite</code> 進行建置，並使用 <code>Tailwind CSS</code> 處理樣式。
        視覺與 3D 互動部分使用了 <code>Three.js</code> 與 <code>@react-three/fiber</code>。
        後端則是以 <code>Node.js</code> 與 <code>Express.js</code> 作為 API Gateway，
        負責串接 Steam、Spotify、WakaTime 與 GitHub 等外部數據，資料庫使用 <code>SQLite</code>。
        基礎設施全部透過 <code>Docker</code> 進行容器化部署。
      </p>

      <h3 id="q3">3. 關於照片牆與 AI 的使用？</h3>
      <p>
        站內的照片集使用 Masonry 佈局，並透過自動化腳本提取 EXIF 資訊。
        後續加入了 AI CLIP Tagger 輔助處理標籤，且上傳圖片時會自動產生 <code>thumbhash</code> 作為模糊佔位圖。
        我會使用 AI 工具協助處理這類瑣碎的自動化流程。詳細可以參考這篇文：
      </p>
      <LinkCard href="https://koimsurai.com/blog/21" />

      <h3 id="q4">4. 這裡有藏彩蛋嗎？</h3>
      <p>
        沒有。沒有實作彩蛋，這裡所見即所得。
      </p>

      <h2 id="name">關於 ID 的由來</h2>

      <h3 id="q5">Q: 為什麼叫 Koimsurai？這名字怎麼唸？</h3>
      <p>
        這其實是一個組合字。我在網路上的慣用名是「木村盆栽」（Kimura Bonsai），而 Koimsurai 就是從這兩個詞的羅馬拼音中萃取組合而成的專屬 ID。
      </p>

      <h3 id="q6">Q: 那為什麼當初要叫「木村盆栽」？</h3>
      <p>
        剛開始只是因為很喜歡木村拓哉，就隨意借用了這個姓氏，加上「盆栽」覺得唸起來很順口就用了。
      </p>
    </InfoPage>
  );
}

export default AboutSite;
