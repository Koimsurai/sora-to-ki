import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Now.css';

const Now = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hoveredCard, setHoveredCard] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 當前狀態數據 - 可以定期手動更新
  const currentStatus = {
    lastUpdated: '2025-10-08',
    mood: '👋',
    location: '台灣 台北 · 微星科技',
    weather: '☀️',
    
    // 正在學習的技術
    learning: [
      {
        id: 1,
        title: 'C# 後端開發',
        progress: 70,
        description: '微星實習主力技術，開發內部網頁後端系統',
        icon: '💻',
        color: '#68217a',
        link: 'https://docs.microsoft.com/zh-tw/dotnet/csharp/'
      },
      {
        id: 2,
        title: 'Python 自動化',
        progress: 80,
        description: '用於後端開發與數據處理',
        icon: '🐍',
        color: '#3776ab',
        link: 'https://www.python.org/'
      },
      {
        id: 3,
        title: 'n8n 工作流自動化',
        progress: 45,
        description: '探索企業級自動化解決方案',
        icon: '⚡',
        color: '#ff6d5a',
        link: 'https://n8n.io/'
      }
    ],

    // 正在進行的專案
    projects: [
      {
        id: 1,
        title: 'MSI 內部網頁後端',
        status: '進行中',
        description: '微星科技實習專案，負責後端系統開發',
        icon: '🏢',
        color: '#e60012',
        tech: ['C#', 'Python', 'ASP.NET']
      },
      {
        id: 2,
        title: 'n8n 自動化探索',
        status: '學習中',
        description: '研究企業工作流程自動化應用',
        icon: '🤖',
        color: '#ff6d5a',
        tech: ['n8n', 'API', 'Workflow']
      },
      {
        id: 3,
        title: '個人品牌網站',
        status: '持續優化',
        description: '添加新功能與內容更新',
        icon: '🌐',
        color: '#8a2be2',
        tech: ['React', 'Three.js', 'Framer Motion']
      }
    ],

    // 生活近況
    life: [
      {
        id: 1,
        category: '實習',
        content: '在微星科技實習，從學校走向業界，學習企業級開發流程與團隊協作',
        icon: '💼',
        color: '#e60012'
      },
      {
        id: 2,
        category: '攝影',
        content: '持續記錄生活點滴，將照片分享到 Instagram，培養美感與觀察力',
        icon: '📷',
        color: '#e91e63'
      },
      {
        id: 3,
        category: '閱讀',
        content: '閱讀技術文章與專業書籍，保持學習動力',
        icon: '📚',
        color: '#2196f3'
      },
      {
        id: 4,
        category: '旅遊',
        content: '喜歡旅遊探索不同城市，用相機記錄美好回憶',
        icon: '✈️',
        color: '#ff9800'
      }
    ],

    // 當前目標
    goals: [
      {
        id: 1,
        goal: '精進 C# 與 Python 後端開發能力',
        progress: 65,
        deadline: '2025 Q2',
        icon: '💻'
      },
      {
        id: 2,
        goal: '掌握 n8n 自動化工作流',
        progress: 40,
        deadline: '2025 Q3',
        icon: '⚡'
      },
      {
        id: 3,
        goal: '成為全方位軟體開發者',
        progress: 55,
        deadline: '2025 年底',
        icon: '🚀'
      },
      {
        id: 4,
        goal: '持續經營 Instagram 攝影作品',
        progress: 70,
        deadline: '持續進行',
        icon: '📸'
      }
    ],

    // 最近的想法
    thoughts: [
      '從學校到職場，每一步都是成長的機會',
      '技術是工具，解決問題才是核心價值',
      '攝影教會我觀察細節，程式教會我邏輯思考',
      '保持上進心，在網路世界中持續探索與學習',
      '期許自己能提供符合用戶需求的網路服務'
    ]
  };

  return (
    <div className="now-container">
      {/* 背景裝飾 */}
      <div className="now-bg-decoration">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>

      {/* 標題區 */}
      <motion.div
        className="now-hero"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="hero-emoji"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {currentStatus.mood}
        </motion.div>

        <h1 className="now-title">
          <span className="title-text">現在</span>
          <span className="title-emoji">· What I'm up to</span>
        </h1>

        <div className="now-meta">
          <motion.div
            className="meta-item"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="meta-icon">📍</span>
            <span>{currentStatus.location}</span>
          </motion.div>

          <motion.div
            className="meta-item"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <span className="meta-icon">🕐</span>
            <span>{currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
          </motion.div>

          <motion.div
            className="meta-item"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <span className="meta-icon">{currentStatus.weather}</span>
            <span>最後更新: {currentStatus.lastUpdated}</span>
          </motion.div>
        </div>
      </motion.div>

      <div className="now-content">
        {/* 正在學習 */}
        <section className="now-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="title-icon">📖</span>
            正在學習
          </motion.h2>

          <div className="learning-grid">
            {currentStatus.learning.map((item, index) => (
              <motion.a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="learning-card"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.03, y: -5 }}
                onHoverStart={() => setHoveredCard(`learning-${item.id}`)}
                onHoverEnd={() => setHoveredCard(null)}
              >
                <div 
                  className="card-header"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <span className="card-icon" style={{ color: item.color }}>
                    {item.icon}
                  </span>
                  <h3 style={{ color: item.color }}>{item.title}</h3>
                </div>

                <p className="card-description">{item.description}</p>

                <div className="progress-bar">
                  <motion.div
                    className="progress-fill"
                    style={{ backgroundColor: item.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${item.progress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                  />
                  <span className="progress-text" style={{ color: item.color }}>
                    {item.progress}%
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        </section>

        {/* 進行中的專案 */}
        <section className="now-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="title-icon">🚀</span>
            進行中的專案
          </motion.h2>

          <div className="projects-grid">
            {currentStatus.projects.map((project, index) => (
              <motion.div
                key={project.id}
                className="project-card"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className="project-header">
                  <span 
                    className="project-icon"
                    style={{ backgroundColor: `${project.color}30` }}
                  >
                    {project.icon}
                  </span>
                  <span 
                    className="project-status"
                    style={{ 
                      backgroundColor: `${project.color}20`,
                      color: project.color 
                    }}
                  >
                    {project.status}
                  </span>
                </div>

                <h3 className="project-title">{project.title}</h3>
                <p className="project-description">{project.description}</p>

                <div className="project-tech">
                  {project.tech.map((tech, techIndex) => (
                    <span 
                      key={techIndex} 
                      className="tech-tag"
                      style={{ borderColor: project.color }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 生活近況 */}
        <section className="now-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="title-icon">🌈</span>
            生活近況
          </motion.h2>

          <div className="life-grid">
            {currentStatus.life.map((item, index) => (
              <motion.div
                key={item.id}
                className="life-card"
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ x: 10 }}
              >
                <div 
                  className="life-icon"
                  style={{ backgroundColor: `${item.color}30` }}
                >
                  {item.icon}
                </div>
                <div className="life-content">
                  <h4 style={{ color: item.color }}>{item.category}</h4>
                  <p>{item.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 當前目標 */}
        <section className="now-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="title-icon">🎯</span>
            當前目標
          </motion.h2>

          <div className="goals-list">
            {currentStatus.goals.map((goal, index) => (
              <motion.div
                key={goal.id}
                className="goal-item"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="goal-header">
                  <div className="goal-info">
                    <span className="goal-icon">{goal.icon}</span>
                    <span className="goal-text">{goal.goal}</span>
                  </div>
                  <span className="goal-deadline">📅 {goal.deadline}</span>
                </div>

                <div className="goal-progress-bar">
                  <motion.div
                    className="goal-progress-fill"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${goal.progress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: index * 0.1 + 0.2 }}
                  />
                  <span className="goal-progress-text">{goal.progress}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* 最近的想法 */}
        <section className="now-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="title-icon">💭</span>
            最近的想法
          </motion.h2>

          <div className="thoughts-container">
            {currentStatus.thoughts.map((thought, index) => (
              <motion.div
                key={index}
                className="thought-card"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                whileHover={{ scale: 1.05, rotate: 1 }}
              >
                <div className="quote-mark">"</div>
                <p>{thought}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* nownownow 運動說明 */}
        <motion.div
          className="now-footer"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="footer-text">
            💡 這是一個 <a href="https://nownownow.com/" target="_blank" rel="noopener noreferrer">/now</a> 頁面
            ，靈感來自 <a href="https://sive.rs/now" target="_blank" rel="noopener noreferrer">Derek Sivers</a>。
            <br />
            用最真誠的方式分享當下的生活狀態，讓訪客了解現在的我正在做什麼。
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Now;