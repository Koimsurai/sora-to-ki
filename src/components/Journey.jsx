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
    id: 1, year: '2015-2018', title: '高中時期', subtitle: '第一份工作與責任',
    description: '高中時期在日本料理店擔任內外場工作，雖然辛苦但培養了良好的工作素養、時間管理能力與待人處事的態度。這段經歷讓我學會如何在學業與工作之間取得平衡。',
    icon: '🍱', color: '#4ade80', tags: ['工作經驗', '成長'],
  },
  {
    id: 2, year: '2019-2020', title: '大一大二', subtitle: '程式技能建立期',
    description: '進入台科大資管系後，開始系統性地學習程式設計。從 Python 基礎開始，逐步學習 Golang、Java 等語言，建立紮實的程式設計基礎。這段時期大量練習，為後續的專案開發打下堅實的根基。',
    icon: '💻', color: '#60a5fa', tags: ['Python', 'Golang', 'Java'],
  },
  {
    id: 3, year: '2020-2021', title: '社團領導經驗', subtitle: '資管系學會會長',
    description: '擔任資管系學會會長，籌辦多項大型活動，培養了領導與團隊合作能力。同時在絃韻吉他社擔任文書，負責活動策劃、攝影與公關事務。這些經歷讓我學會如何與團隊溝通協作，以及如何統籌規劃大型專案。',
    icon: '👥', color: '#a78bfa', tags: ['領導', '團隊合作', '活動策劃'],
  },
  {
    id: 4, year: '2021-2022', title: '攝影與美感培養', subtitle: '台科攝影社教學幹部',
    description: '擔任台科攝影社的教學幹部，樂於分享攝影知識並規劃教學內容。透過攝影培養美感與設計能力，並將各種照片紀錄發在 Instagram 上。攝影不僅是興趣，更成為我觀察世界、記錄生活的重要方式。',
    icon: '📷', color: '#f472b6', tags: ['攝影', '美感', '教學'],
  },
  {
    id: 5, year: '2024.07', title: '程式教學經驗', subtitle: '猿創力程式設計學校',
    description: '在猿創力程式設計學校擔任程式教師，教導3~9年級學生 Python(pygame)、MCE(Minecraft教育版)、Scratch、AI2 等課程。這段經歷讓我在溝通與表達能力上獲得顯著提升，學會如何將複雜的程式概念用淺顯易懂的方式傳授給學生。',
    icon: '🎓', color: '#fb923c', tags: ['教學', 'Python', 'Minecraft'],
  },
  {
    id: 6, year: '2024.09', title: 'App 開發實戰', subtitle: '高偉數學補習班 資訊助理',
    description: '在高偉數學補習班擔任資訊助理及企劃人員，負責 App 開發(Kotlin)、宣傳影片剪輯、封面製作等工作。邊做邊學，建立了完整的 App 開發流程基礎與專案管理概念。成功將補習班 App 上線維運，累積超過一年的 Android 開發實戰經驗。',
    icon: '📱', color: '#34d399', tags: ['Kotlin', 'Android', 'App開發'],
  },
  {
    id: 7, year: '2024', title: 'UI/UX 與專案管理', subtitle: '設計與管理工具精進',
    description: '熟悉使用 Figma 進行 UI/UX 設計，並習慣利用 Notion 進行專案管理與知識整理。透過實際專案經驗，學會如何設計使用者友善的介面，以及如何有效管理專案進度與團隊協作。',
    icon: '🎨', color: '#818cf8', tags: ['Figma', 'Notion', 'UI/UX'],
  },
  {
    id: 8, year: '2025', title: '微星科技實習', subtitle: '後端開發與自動化',
    description: '大四下學期進入微星科技(MSI)擔任實習生，主要負責內部網頁後端開發，使用 C# 及 Python 進行開發。將接觸 n8n 自動化工作流以及更多的 App 開發專案。這是我從學校走向業界的重要轉折，在真實的企業環境中學習與成長。',
    icon: '🏢', color: '#fbbf24', tags: ['C#', 'Python', 'n8n', '後端'],
  },
  {
    id: 9, year: '未來', title: '持續探索', subtitle: '成為全方位開發者',
    description: '樂於學習，在網路世界中保持一顆上進心。期許未來能夠接觸不同類型產品、使用者，發揮專長與經驗，幫公司解決問題，提供符合用戶需求的網路服務。從前端到後端，從設計到部署，持續精進技術能力與專案經驗。',
    icon: '🚀', color: '#ec4899', tags: ['未來', '全端開發', '成長'],
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
      <SEOHead title="旅程 | Koimsurai" description="楊泰和的職業成長與學習旅程時間線。" />

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
