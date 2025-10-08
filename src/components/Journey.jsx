import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import './Journey.css';

const Journey = () => {
  const [activeIndex, setActiveIndex] = useState(null);
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // 個人成長時間軸數據
  const milestones = [
    {
      id: 1,
      year: '2015-2018',
      title: '高中時期',
      subtitle: '第一份工作與責任',
      description: '高中時期在日本料理店擔任內外場工作，雖然辛苦但培養了良好的工作素養、時間管理能力與待人處事的態度。這段經歷讓我學會如何在學業與工作之間取得平衡。',
      icon: '🍱',
      color: '#4ade80',
      tags: ['工作經驗', '成長'],
      image: '💼'
    },
    {
      id: 2,
      year: '2019-2020',
      title: '大一大二',
      subtitle: '程式技能建立期',
      description: '進入台科大資管系後，開始系統性地學習程式設計。從 Python 基礎開始，逐步學習 Golang、Java 等語言，建立紮實的程式設計基礎。這段時期大量練習，為後續的專案開發打下堅實的根基。',
      icon: '💻',
      color: '#60a5fa',
      tags: ['Python', 'Golang', 'Java'],
      image: '�'
    },
    {
      id: 3,
      year: '2020-2021',
      title: '社團領導經驗',
      subtitle: '資管系學會會長',
      description: '擔任資管系學會會長，籌辦多項大型活動，培養了領導與團隊合作能力。同時在絃韻吉他社擔任文書，負責活動策劃、攝影與公關事務。這些經歷讓我學會如何與團隊溝通協作，以及如何統籌規劃大型專案。',
      icon: '👥',
      color: '#a78bfa',
      tags: ['領導', '團隊合作', '活動策劃'],
      image: '🎯'
    },
    {
      id: 4,
      year: '2021-2022',
      title: '攝影與美感培養',
      subtitle: '台科攝影社教學幹部',
      description: '擔任台科攝影社的教學幹部，樂於分享攝影知識並規劃教學內容。透過攝影培養美感與設計能力，並將各種照片紀錄發在 Instagram 上。攝影不僅是興趣，更成為我觀察世界、記錄生活的重要方式。',
      icon: '�',
      color: '#f472b6',
      tags: ['攝影', '美感', '教學'],
      image: '🌌'
    },
    {
      id: 5,
      year: '2024.07',
      title: '程式教學經驗',
      subtitle: '猿創力程式設計學校',
      description: '在猿創力程式設計學校擔任程式教師，教導3~9年級學生 Python(pygame)、MCE(Minecraft教育版)、Scratch、AI2 等課程。這段經歷讓我在溝通與表達能力上獲得顯著提升，學會如何將複雜的程式概念用淺顯易懂的方式傳授給學生。',
      icon: '🎓',
      color: '#fb923c',
      tags: ['教學', 'Python', 'Scratch'],
      image: '�‍🏫'
    },
    {
      id: 6,
      year: '2024.09',
      title: 'App 開發實戰',
      subtitle: '高偉數學補習班 資訊助理',
      description: '在高偉數學補習班擔任資訊助理及企劃人員，負責 App 開發(Kotlin)、宣傳影片剪輯、封面製作等工作。邊做邊學，建立了完整的 App 開發流程基礎與專案管理概念。成功將補習班 App 上線維運，累積超過一年的 Android 開發實戰經驗。',
      icon: '📱',
      color: '#34d399',
      tags: ['Kotlin', 'Android', 'App開發'],
      image: '🚀'
    },
    {
      id: 7,
      year: '2024',
      title: 'UI/UX 與專案管理',
      subtitle: '設計與管理工具精進',
      description: '熟悉使用 Figma 進行 UI/UX 設計，並習慣利用 Notion 進行專案管理與知識整理。透過實際專案經驗，學會如何設計使用者友善的介面，以及如何有效管理專案進度與團隊協作。',
      icon: '🎨',
      color: '#818cf8',
      tags: ['Figma', 'Notion', 'UI/UX'],
      image: '✨'
    },
    {
      id: 8,
      year: '2025',
      title: '微星科技實習',
      subtitle: '後端開發與自動化',
      description: '大四下學期進入微星科技(MSI)擔任實習生，主要負責內部網頁後端開發，使用 C# 及 Python 進行開發。將接觸 n8n 自動化工作流以及更多的 App 開發專案。這是我從學校走向業界的重要轉折，在真實的企業環境中學習與成長。',
      icon: '🏢',
      color: '#fbbf24',
      tags: ['C#', 'Python', 'n8n', '後端'],
      image: '💼'
    },
    {
      id: 9,
      year: '未來',
      title: '持續探索',
      subtitle: '成為全方位開發者',
      description: '樂於學習，在網路世界中保持一顆上進心。期許未來能夠接觸不同類型產品、使用者，發揮專長與經驗，幫公司解決問題，提供符合用戶需求的網路服務。從前端到後端，從設計到部署，持續精進技術能力與專案經驗。',
      icon: '🚀',
      color: '#ec4899',
      tags: ['未來', '全端開發', '成長'],
      image: '🌟'
    }
  ];

  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className="journey-container" ref={containerRef}>
      {/* 星空背景 */}
      <div className="journey-stars-bg">
        <div className="stars-layer stars-sm"></div>
        <div className="stars-layer stars-md"></div>
        <div className="stars-layer stars-lg"></div>
      </div>

      {/* 標題區 */}
      <motion.div
        className="journey-hero"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="hero-decoration"
          animate={{
            rotate: [0, 360],
            scale: [1, 1.1, 1]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <div className="orbit-ring orbit-1"></div>
          <div className="orbit-ring orbit-2"></div>
          <div className="orbit-ring orbit-3"></div>
          <div className="center-planet">🌍</div>
        </motion.div>

        <motion.h1
          className="journey-title"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <span className="title-gradient">我的成長軌跡</span>
          <motion.span
            className="title-icon"
            animate={{
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            🛸
          </motion.span>
        </motion.h1>

        <motion.p
          className="journey-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          從第一行代碼到星辰大海，記錄每一個重要時刻 ✨
        </motion.p>
      </motion.div>

      {/* 時間軸主體 */}
      <div className="timeline-wrapper">
        {/* SVG 時間軸線 */}
        <svg className="timeline-path" viewBox="0 0 100 100" preserveAspectRatio="none">
          <motion.path
            d="M 50 0 Q 30 25, 50 50 T 50 100"
            fill="none"
            stroke="url(#pathGradient)"
            strokeWidth="0.5"
            strokeLinecap="round"
            style={{
              pathLength: pathLength,
              opacity: 0.3
            }}
          />
          <defs>
            <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00aaff" />
              <stop offset="50%" stopColor="#8a2be2" />
              <stop offset="100%" stopColor="#ff1493" />
            </linearGradient>
          </defs>
        </svg>

        {/* 時間軸節點 */}
        <div className="timeline-content">
          {milestones.map((milestone, index) => {
            const isEven = index % 2 === 0;
            
            return (
              <motion.div
                key={milestone.id}
                className={`milestone-wrapper ${isEven ? 'left' : 'right'}`}
                initial={{ opacity: 0, x: isEven ? -100 : 100 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{
                  duration: 0.8,
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1]
                }}
              >
                {/* 時間軸節點指示器 */}
                <motion.div
                  className="milestone-indicator"
                  whileHover={{ scale: 1.5 }}
                  onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                  style={{ backgroundColor: milestone.color }}
                >
                  <motion.div
                    className="pulse-ring"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 0, 0.5]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeOut"
                    }}
                    style={{ borderColor: milestone.color }}
                  />
                  <span className="milestone-icon">{milestone.icon}</span>
                </motion.div>

                {/* 連接線 */}
                <motion.div
                  className={`connector-line ${isEven ? 'to-left' : 'to-right'}`}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 + 0.3 }}
                  style={{ backgroundColor: milestone.color }}
                />

                {/* 內容卡片 */}
                <motion.div
                  className="milestone-card"
                  whileHover={{ 
                    scale: 1.05,
                    boxShadow: `0 0 40px ${milestone.color}40`
                  }}
                  onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                  style={{
                    borderColor: `${milestone.color}40`
                  }}
                >
                  <div 
                    className="card-glow"
                    style={{
                      background: `linear-gradient(135deg, ${milestone.color}20, transparent)`
                    }}
                  />

                  <div className="card-header">
                    <motion.div
                      className="year-badge"
                      style={{ backgroundColor: `${milestone.color}30` }}
                      whileHover={{ scale: 1.1 }}
                    >
                      <span className="year-text" style={{ color: milestone.color }}>
                        {milestone.year}
                      </span>
                    </motion.div>
                    <div className="emoji-badge">{milestone.image}</div>
                  </div>

                  <h3 className="milestone-title">{milestone.title}</h3>
                  <h4 className="milestone-subtitle">{milestone.subtitle}</h4>

                  <AnimatePresence>
                    {activeIndex === index && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <p className="milestone-description">{milestone.description}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="milestone-tags">
                    {milestone.tags.map((tag, tagIndex) => (
                      <motion.span
                        key={tagIndex}
                        className="tag"
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 + tagIndex * 0.05 }}
                        whileHover={{ scale: 1.1 }}
                        style={{
                          borderColor: milestone.color,
                          color: milestone.color
                        }}
                      >
                        #{tag}
                      </motion.span>
                    ))}
                  </div>

                  <motion.button
                    className="expand-btn"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {activeIndex === index ? '收起詳情 ▲' : '查看詳情 ▼'}
                  </motion.button>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 結尾區 */}
      <motion.div
        className="journey-ending"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="ending-icon"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 360]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          ∞
        </motion.div>
        <h2 className="ending-title">旅程未完待續...</h2>
        <p className="ending-text">
          每一次學習都是新的冒險，每一個專案都是新的挑戰。
          <br />
          讓我們一起探索更廣闊的技術宇宙！🚀✨
        </p>
      </motion.div>
    </div>
  );
};

export default Journey;
