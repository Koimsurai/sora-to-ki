import React from 'react';
import './AboutMe.css';

const AboutMe = () => {
  return (
    <section id="about-me" className="about-me-section">
      <h2>✨ 關於我</h2>
      <div className="about-me-container">
        {/* 將文字內容包裹起來 */}
        <div className="about-me-text-content">
          <p>
            你好！我是楊泰和，2004年出生的雲林人，水瓶座A型。目前就讀於國立台灣科技大學資訊管理系四年級，現於<strong>微星科技(MSI)</strong>擔任實習生。我喜歡閱讀、旅遊，並將各種照片紀錄下來，發在自己的Instagram，除了是興趣，也培養自己的美感與設計能力。
          </p>
          <p>
            我具備 <strong>C++</strong>、<strong>Python</strong>、<strong>Java</strong>、<strong>Golang</strong> 的程式基礎，並擁有超過一年的 <strong>Android (Java/Kotlin)</strong> 與 <strong>Flutter</strong> App 開發實戰經驗，成功將高偉數學補習班 App 上線維運。同時，我也投入於全端開發專案，運用 <strong>MongoDB</strong>、<strong>Docker</strong> 部署及 <strong>Git</strong> 版本控制。目前在微星實習期間，主要負責內部網頁後端開發（<strong>C#</strong> 及 <strong>Python</strong>），並將接觸 <strong>n8n 自動化工作流</strong>及更多 App 開發專案。
          </p>
          <p>
            除了技術開發，我也積極參與課外活動與工作經驗。高中時期在日本料理店擔任內外場工作，培養了良好的工作素養與時間管理能力。大學期間曾擔任 <strong>資管系學會會長</strong>，籌辦多項大型活動，培養了領導與團隊合作能力。在 <strong>絃韻吉他社</strong> 擔任文書期間，不僅參與活動策劃，也負責攝影與公關事務。此外，身為 <strong>台科攝影社</strong> 的教學幹部，我樂於分享攝影知識並規劃教學內容。
          </p>
          <p>
            我曾在<strong>猿創力程式設計學校</strong>擔任程式教師，教導3~9年級學生Python(pygame)、MCE(Minecraft教育版)、Scratch、AI2等課程，這段經歷讓我在溝通與表達能力上獲得顯著提升。在<strong>高偉數學補習班</strong>擔任資訊助理及企劃人員期間，負責App開發(Kotlin)及宣傳影片剪輯、封面製作等工作，邊做邊學，建立了完整的 App 開發流程基礎與專案管理概念。
          </p>
          <p>
            我熟悉使用 <strong>Figma</strong> 進行 UI/UX 設計，並習慣利用 <strong>GitHub</strong> 進行專案管理並用 <strong>Notion</strong> 進行知識整理。樂於學習，在網路世界中保持一顆上進心，期許未來能夠接觸不同類型產品、使用者，發揮專長與經驗，幫公司解決問題，提供符合用戶需求的網路服務。
          </p>
        </div>
      </div>
    </section>
  );
};

export default AboutMe;
