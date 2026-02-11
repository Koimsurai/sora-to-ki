import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  SiRust, SiNextdotjs, SiReact, SiDocker, SiTypescript, SiPython,
  SiThreedotjs, SiTailwindcss
} from 'react-icons/si';
import { FaCat, FaGamepad, FaCamera, FaServer, FaBrain } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './Now.css';

// ── 狀態燈顏色 ──
const statusColors = {
  green: '#2cb67d',
  yellow: '#f5c542',
  purple: '#7f5af0',
  blue: '#00aaff',
};

// ── 資料 ──
const statusBadges = [
  { label: 'Building AI System', color: 'green', emoji: '🟢' },
  { label: 'Debugging NAS', color: 'yellow', emoji: '🟡' },
  { label: 'Learning Rust', color: 'purple', emoji: '🟣' },
];

const learningItems = [
  {
    title: 'Rust',
    desc: '為了更底層的效能與安全性，朝開源大佬邁進',
    icon: SiRust,
    color: '#dea584',
    progress: 25,
  },
  {
    title: 'Next.js',
    desc: '制定公司 AI 系統前端架構 (Monorepo / Routing)',
    icon: SiNextdotjs,
    color: '#ffffff',
    progress: 70,
  },
  {
    title: 'AI 工具鏈整合',
    desc: '探索並整合 AI 工具至企業級開發流程',
    icon: FaBrain,
    color: '#a78bfa',
    progress: 55,
  },
];

const projects = [
  {
    title: 'AI 系統開發',
    status: '進行中',
    statusColor: 'green',
    desc: '負責全公司內部的 AI 系統前端架構與規範落地',
    techs: [
      { name: 'Next.js', icon: SiNextdotjs },
      { name: 'TypeScript', icon: SiTypescript },
      { name: 'React', icon: SiReact },
    ],
  },
  {
    title: 'Koimsurai NAS',
    status: 'Debug 中',
    statusColor: 'yellow',
    desc: 'Homelab OS 進入試用期，Docker 容器化 24/7 穩定運作',
    techs: [
      { name: 'Rust', icon: SiRust },
      { name: 'Docker', icon: SiDocker },
      { name: 'Next.js', icon: SiNextdotjs },
    ],
  },
  {
    title: '個人品牌網站',
    status: '持續優化',
    statusColor: 'purple',
    desc: '你正在看的這個站！Three.js 太空主題 + 持續新增功能',
    techs: [
      { name: 'React', icon: SiReact },
      { name: 'Three.js', icon: SiThreedotjs },
      { name: 'Tailwind', icon: SiTailwindcss },
    ],
  },
];

const lifeItems = [
  {
    icon: '💼',
    title: '工作重心',
    content: 'Team 內唯一 Frontend 負責人，專注於「讓系統長期可維護」。正在練習把責任邊界劃分清楚，建立穩定的上線流程。',
    color: '#7f5af0',
  },
  {
    icon: '🐈',
    title: 'Aki & Kuro',
    content: 'Kuro 話癆型，喵兩聲蹭一蹭就倒地翻滾。Aki 撒嬌型，連上廁所都想衝進來。紙箱、塑膠、橡皮筋是違禁品。',
    color: '#f59e0b',
  },
  {
    icon: '🎮',
    title: '休閒',
    content: '打遊戲、看漫畫/動畫、寫 Code（沒錯，休閒也是寫 Code）。相機目前積灰塵狀態，等待重新發掘攝影樂趣的那天。',
    color: '#2cb67d',
  },
];

const progressBars = [
  { label: 'Rust 學習進度', value: 25, color: '#dea584', note: '剛開始 ownership 地獄' },
  { label: 'NAS 穩定度', value: 72, color: '#2cb67d', note: 'Docker 穩了，SSL 還在搞' },
  { label: '工作與生活平衡', value: 45, color: '#f5c542', note: '努力中...' },
  { label: '成為開源大佬', value: 10, color: '#7f5af0', note: '先把 README 寫好' },
];

const thoughts = [
  '想專注在「做事」而非「反覆溝通」',
  '不排斥責任，但討厭沒邏輯的變動',
  '正在練習不把所有事情扛在自己肩上',
  '技術是工具，解決問題才是核心價值',
];

// ── 動畫 variants ──
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: 'easeOut' },
  }),
};

const Now = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="now-page">
      <SEOHead
        title="現在 · Now"
        description="楊泰和目前的工作重心、正在學習的技術、進行中的專案與生活近況。A /now page snapshot."
        path="/now"
      />

      {/* ── 星雲背景 ── */}
      <div className="now-nebula-bg">
        <div className="nebula-layer nebula-1" />
        <div className="nebula-layer nebula-2" />
        <div className="nebula-layer nebula-3" />
        <div className="nebula-dust" />
      </div>

      {/* ── 主內容 ── */}
      <div className="now-content">

        {/* Hero */}
        <motion.header
          className="now-hero"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <div className="now-hero-top">
            <h1 className="now-title">
              <span className="now-title-gradient">現在</span>
              <span className="now-title-sub">· What I'm up to</span>
            </h1>
            <div className="now-status-badges">
              {statusBadges.map((b) => (
                <span key={b.label} className="status-badge" style={{ '--badge-color': statusColors[b.color] }}>
                  <span className="status-dot" />
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          <div className="now-meta-row">
            <span className="now-meta-item">📍 台灣 台北</span>
            <span className="now-meta-item">
              🕐 {currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="now-meta-item">🔄 最後更新: 2026-02-11</span>
          </div>

          <p className="now-hero-desc">
            目前的狀態是：<strong>全棧技能點滿，但專注於前端架構與系統整合</strong>。<br />
            正在把生活與工作整理成「能長期穩定運作」的樣子。
          </p>
        </motion.header>

        {/* ── 正在學 ── */}
        <section className="now-section">
          <motion.h2 className="now-section-title" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="section-icon">📖</span> 正在學習
          </motion.h2>
          <div className="now-learning-grid">
            {learningItems.map((item, i) => (
              <motion.div
                key={item.title}
                className="now-learning-card"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
              >
                <div className="learning-card-top">
                  <item.icon className="learning-tech-icon" style={{ color: item.color }} />
                  <h3>{item.title}</h3>
                </div>
                <p>{item.desc}</p>
                <div className="now-progress">
                  <motion.div
                    className="now-progress-fill"
                    style={{ backgroundColor: item.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${item.progress}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: i * 0.1 + 0.3 }}
                  />
                  <span className="now-progress-label" style={{ color: item.color }}>{item.progress}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 進行中的專案 ── */}
        <section className="now-section">
          <motion.h2 className="now-section-title" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="section-icon">🚀</span> 進行中的專案
          </motion.h2>
          <div className="now-projects-grid">
            {projects.map((p, i) => (
              <motion.div
                key={p.title}
                className="now-project-card"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
              >
                <div className="project-card-header">
                  <h3>{p.title}</h3>
                  <span className="project-status-pill" style={{ '--pill-color': statusColors[p.statusColor] }}>
                    <span className="status-dot" />
                    {p.status}
                  </span>
                </div>
                <p>{p.desc}</p>
                <div className="project-tech-row">
                  {p.techs.map((t) => (
                    <span key={t.name} className="project-tech-chip">
                      <t.icon className="tech-chip-icon" />
                      {t.name}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 生活近況 ── */}
        <section className="now-section">
          <motion.h2 className="now-section-title" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="section-icon">🌈</span> 生活近況
          </motion.h2>
          <div className="now-life-list">
            {lifeItems.map((item, i) => (
              <motion.div
                key={item.title}
                className="now-life-card"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ x: 6 }}
              >
                <span className="life-card-icon" style={{ backgroundColor: `${item.color}18` }}>{item.icon}</span>
                <div className="life-card-body">
                  <h4 style={{ color: item.color }}>{item.title}</h4>
                  <p>{item.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 工程師進度條 ── */}
        <section className="now-section">
          <motion.h2 className="now-section-title" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="section-icon">📊</span> 工程師儀表板
          </motion.h2>
          <div className="now-dashboard-grid">
            {progressBars.map((bar, i) => (
              <motion.div
                key={bar.label}
                className="now-dashboard-item"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <div className="dashboard-item-header">
                  <span className="dashboard-label">{bar.label}</span>
                  <span className="dashboard-note">{bar.note}</span>
                </div>
                <div className="now-progress large">
                  <motion.div
                    className="now-progress-fill"
                    style={{ backgroundColor: bar.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${bar.value}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: i * 0.1 + 0.2 }}
                  />
                  <span className="now-progress-label" style={{ color: bar.color }}>{bar.value}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 最近的想法 ── */}
        <section className="now-section">
          <motion.h2 className="now-section-title" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="section-icon">💭</span> 最近的想法
          </motion.h2>
          <div className="now-thoughts-grid">
            {thoughts.map((t, i) => (
              <motion.div
                key={i}
                className="now-thought-card"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ scale: 1.03 }}
              >
                <span className="thought-quote">"</span>
                <p>{t}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <motion.footer
          className="now-footer"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <p>
            💡 這是一個{' '}
            <a href="https://nownownow.com/" target="_blank" rel="noopener noreferrer">/now</a>{' '}
            頁面，靈感來自{' '}
            <a href="https://sive.rs/now" target="_blank" rel="noopener noreferrer">Derek Sivers</a>。
            <br />
            用最真誠的方式分享當下的生活狀態。
          </p>
        </motion.footer>
      </div>
    </div>
  );
};

export default Now;
