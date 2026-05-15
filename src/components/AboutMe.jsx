import { motion } from 'framer-motion';
import './AboutMe.css';

const QUICK_FACTS = [
  { label: 'Born', value: '2004 · 雲林' },
  { label: 'School', value: 'NTUST · 資管系 4年級' },
  { label: 'Currently', value: '微星科技 軟體工程實習' },
  { label: 'Side', value: '攝影 · 旅遊 · 閱讀' },
  { label: 'Coding since', value: '2017' },
];

const PARAGRAPHS = [
  '我是楊泰和，2004 年出生的雲林人。目前就讀國立台灣科技大學資訊管理系四年級，現在 微星科技 (MSI) 擔任軟體工程實習生。',
  '具備 C++ / Python / Java / Golang 程式基礎，超過一年 Android (Java/Kotlin) 與 Flutter App 開發經驗。主導補習班 App 上線維運、全端開發專案（MongoDB / Docker / Git）。實習期間負責 ASP.NET 後端、Monorepo 架構、Python 自動化腳本與內部前端。',
  '高中時在日本料理店做內外場、大學擔任資管系學會會長、絃韻吉他社文書與台科攝影社教學幹部。也曾在猿創力程式設計學校教 3–9 年級學生 Python / MCE / Scratch，磨練表達與規劃能力。',
  '熟悉 Figma 做 UI/UX、GitHub 管專案、Notion 整理知識。樂於把複雜的事情做清楚，期許未來能在不同類型的產品與使用者之間，做出讓人覺得「順手」的東西。',
];

const AboutMe = () => (
  <section id="about-me" className="home-section about-me-v2">
    <div className="home-section-eyebrow">
      <span className="section-label">About</span>
      <span className="section-eyebrow-count">楊泰和 · Timo</span>
    </div>

    <div className="about-grid">
      <motion.div
        className="about-bio"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h2 className="section-hero-title">把複雜的事情<br />做得讓人「順手」。</h2>
        {PARAGRAPHS.map((p, i) => (
          <p key={i} className="about-paragraph">{p}</p>
        ))}
      </motion.div>

      <motion.aside
        className="about-facts glass-card"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
      >
        <span className="section-label about-facts-label">Quick Facts</span>
        <dl>
          {QUICK_FACTS.map((f) => (
            <div key={f.label} className="about-fact-row">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </motion.aside>
    </div>
  </section>
);

export default AboutMe;
