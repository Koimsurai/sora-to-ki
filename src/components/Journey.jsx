import { useState, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import SEOHead from './SEOHead';
import './Journey.css';

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: 'easeOut' },
  }),
};

const variants = ['left-text', 'center-watermark', 'right-text'];

const milestones = [
  {
    id: 1, year: '2004', title: '出生', subtitle: '水瓶座 A 型',
    description: '出生於 2004 年。理性的程式邏輯與感性的美學設計——這兩種看似衝突的特質，讓我在開發前端介面與規劃系統架構時，能同時兼顧使用者的視覺體驗與程式碼的運作效率。',
    icon: '🌟', color: '#c084fc', tags: ['全端工程師', '攝影', '設計'],
  },
  {
    id: 2, year: '2019-2021', title: '啟蒙與磨練', subtitle: '日本料理店內外場',
    description: '高中時期的第一份工作是在日本料理店擔任內外場人員。日本職人對於「備料規矩」與「服務禮儀」的嚴苛要求，深深影響了我日後的工作態度。即使在忙碌的高壓環境下，仍能保持冷靜依照 SOP 處理繁雜事務，培養出優異的時間管理能力與抗壓性。',
    icon: '🍱', color: '#4ade80', tags: ['抗壓性', '工作素養', '時間管理'],
  },
  {
    id: 3, year: '2022-2023', title: '大學前期', subtitle: '跨領域探索與領導力養成',
    description: '進入大學後積極充實技術棧（Python, Golang, Java），並跳出舒適圈擔任系學會會長與吉他社文書。除了繁重課業，還需協調社團內的人力與資源，磨練了多工處理能力，學會帶領團隊、進行跨部門溝通，這些軟實力成為日後在職場上與不同 Team 協作的重要基石。',
    icon: '👥', color: '#60a5fa', tags: ['Python', 'Golang', 'Java', '領導', '團隊合作'],
  },
  {
    id: 4, year: '2024.07', title: '程式教育經驗', subtitle: '猿創力程式設計學校',
    description: '大三時加入猿創力程式設計學校。面對 3~9 年級的學生與家長，必須將艱澀的程式邏輯轉化為淺顯易懂的語言，極大提升了溝通表達能力。教授 Python(pygame)、MCE、Scratch、AI2 等課程。',
    icon: '🎓', color: '#fb923c', tags: ['教學', 'Python', '溝通力'],
  },
  {
    id: 5, year: '2024.09', title: 'APP 前端開發', subtitle: '高偉數學補習班 資訊助理',
    description: '負責 Android APP 前端開發 (Kotlin) 以及行銷影片剪輯 (Premiere)。在此期間開始接觸 GitHub 協作流程，學會版本控制基礎，並能獨立完成主管交辦的前端切版與功能實作。',
    icon: '📱', color: '#34d399', tags: ['Kotlin', 'Android', 'Premiere', 'GitHub'],
  },
  {
    id: 6, year: '2024', title: '大學專題', subtitle: 'EV 充電整合平台與遊戲化 ESG',
    description: '畢業專題目標是解決電動車車主需下載多個 APP 的痛點，打造整合各大充電樁平台的聚合服務。後端導入 Redis 快取優化地圖效能；使用 FastAPI 讀取車載 CAN Log 將行車歷程轉化為減碳積分；Flutter APP 首創「橫向捲軸遊戲化」介面傳遞 ESG 永續觀念。同時具備完整 Infra 能力——Docker 容器化、Nginx 反向代理、Cloudflare 防護、hMailServer 郵件服務。還開發了 Discord Bot 實現 ChatOps，團隊成員可直接下指令自動新增 Issue、即時監控 Server 狀態與 Log。',
    icon: '⚡', color: '#a78bfa', tags: ['Redis', 'FastAPI', 'Flutter', 'Docker', 'Nginx', 'Discord Bot'],
  },
  {
    id: 7, year: '2025', title: '微星科技 (MSI) 實習', subtitle: '軟體工程師・架構標準化',
    description: '主導導入 Monorepo (Turborepo) 架構，解決跨專案代碼共用痛點，並建立 ESLint/Prettier/TypeScript 等嚴格規範。擔任前端技術窗口，與 AI Team 及 IT Team 密切合作，協助整合 AI 模型應用並參與 GitLab CI/CD 流程優化。近期正在導入 Tauri 將 Web 轉為桌面軟體，並嘗試 POC 推動公司 AI 專案到全世界。從「獨立開發者」晉升為具備「架構思維」的工程師。',
    icon: '🏢', color: '#fbbf24', tags: ['Turborepo', 'Tauri', 'TypeScript', 'CI/CD', 'AI整合'],
  },
  {
    id: 8, year: '現在', title: '個人專案與持續進化', subtitle: '在網路世界保持上進心',
    description: '獨立使用 React 結合 Three.js 開發 3D 互動個人網站，展現不同於一般平面網頁的使用者體驗。因為對現有工具不滿意，主動自學 UI/UX 來優化專案；近期更開始研究 Rust 與 Home Lab (NAS) 領域，探索更底層的系統運作。',
    icon: '🔭', color: '#f472b6', tags: ['React', 'Three.js', 'Rust', 'NAS', 'UI/UX'],
  },
  {
    id: 9, year: '未來', title: '持續探索', subtitle: '打造穩定、高效且符合用戶需求的服務',
    description: '期許未來能發揮全端開發能力與架構經驗，不只是寫出會動的程式碼，而是打造出穩定、高效且符合用戶需求的優質服務。接觸不同類型產品與使用者，從前端到後端，從設計到部署，持續精進。',
    icon: '🚀', color: '#ec4899', tags: ['全端開發', '架構設計', '成長'],
  },
];

const Journey = () => {
  const [activeIndex, setActiveIndex] = useState(null);
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const progressY = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <div className="journey-page" ref={containerRef}>
      <SEOHead title="旅程" description="楊泰和的職業成長與學習旅程時間線。" path="/journey" />

      <div className="journey-dim-overlay" />
      <div className="journey-nebula-bg">
        <div className="nebula-layer journey-nebula-1" />
        <div className="nebula-layer journey-nebula-2" />
        <div className="nebula-layer journey-nebula-3" />
        <div className="journey-nebula-dust" />
      </div>

      {/* Progress Track */}
      <div className="progress-track">
        <motion.div className="progress-dot" style={{ top: progressY }} />
        {milestones.map((m, i) => (
          <div
            key={m.id}
            className="progress-year-label"
            style={{ top: `${(i / (milestones.length - 1)) * 100}%` }}
          >
            {m.year.length > 5 ? m.year.slice(-4) : m.year}
          </div>
        ))}
      </div>

      <div className="journey-content-wrapper">
        {/* Hero */}
        <motion.div
          className="journey-hero"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.h1 className="journey-title" variants={fadeUp}>
            <span className="title-gradient">我的成長軌跡</span>
          </motion.h1>
          <motion.p className="journey-subtitle" variants={fadeUp}>
            從第一行代碼到星辰大海，記錄每一個重要時刻
          </motion.p>
        </motion.div>

        {/* Story Sections */}
        <div className="story-sections">
          {milestones.map((milestone, index) => {
            const variant = variants[index % 3];
            const isActive = activeIndex === index;

            return (
              <motion.section
                key={milestone.id}
                className="story-section"
                data-variant={variant}
                style={{ '--milestone-color': milestone.color }}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Watermark year (all variants, but prominent on center) */}
                <div className={`watermark-year ${variant === 'center-watermark' ? 'prominent' : ''}`}>
                  {milestone.year}
                </div>

                {/* Decoration side */}
                {variant !== 'center-watermark' && (
                  <div className="section-decoration">
                    <motion.div
                      className="decoration-icon"
                      initial={{ opacity: 0, scale: 0.5 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    >
                      {milestone.icon}
                    </motion.div>
                    {variant === 'left-text' && (
                      <div className="decoration-circles">
                        <div className="deco-circle deco-circle-1" />
                        <div className="deco-circle deco-circle-2" />
                      </div>
                    )}
                    {variant === 'right-text' && (
                      <div className="decoration-accent-line" />
                    )}
                  </div>
                )}

                {/* Text content */}
                <div className="section-text">
                  <div className="section-meta">
                    <span className="year-badge">{milestone.year}</span>
                    {variant === 'center-watermark' && (
                      <span className="section-icon">{milestone.icon}</span>
                    )}
                  </div>

                  <h3 className="section-title">{milestone.title}</h3>
                  <h4 className="section-subtitle">{milestone.subtitle}</h4>

                  <AnimatePresence>
                    {isActive && (
                      <motion.p
                        className="section-description"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {milestone.description}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <div className="section-tags">
                    {milestone.tags.map((tag, tagIndex) => (
                      <span key={tagIndex} className="story-tag">#{tag}</span>
                    ))}
                  </div>

                  <button
                    className="expand-btn"
                    onClick={() => setActiveIndex(isActive ? null : index)}
                  >
                    {isActive ? '收起 ▲' : '查看詳情 ▼'}
                  </button>
                </div>
              </motion.section>
            );
          })}
        </div>

        {/* Ending */}
        <motion.div
          className="journey-ending"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="ending-title">旅程未完待續...</h2>
          <p className="ending-text">
            每一次學習都是新的冒險，每一個專案都是新的挑戰。
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Journey;
