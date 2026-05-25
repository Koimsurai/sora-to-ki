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
  '我是 Koimsurai，2004 年出生的雲林人。目前就讀國立台灣科技大學資訊管理系四年級，現於微星科技 (MSI) 擔任軟體工程實習生，並於部門內實質負責前端框架標準與底層架構設計。',
  '過去具備 C++ / Python / Golang 與 App 開發經驗。在微星任職期間，我主導導入 Tauri + Rust 現代化輕量架構，替換原有龐大系統；獨立建置跨環境的 CI/CD 自動化部署管線，並完成「雲地混合 (Cloud-Edge Hybrid)」的 AI 系統部署架構。具備從前端 UI/UX 到系統底層記憶體控管的全端落地能力，並能解決複雜的跨環境編譯與資安漏洞問題。',
  '工作之外，我是一名 HomeLab 狂熱者。自行維護 24/7 的伺服器叢集，並從零開發個人 Web NAS OS (Next.js + Rust) 與專屬 AI 助理。',
  '我曾擔任資管系學會會長與程式講師，習慣用 Notion 與 GitHub 梳理複雜資訊，並熟練使用 Figma 進行介面設計。我相信好的軟體不僅需要強悍的底層架構支撐，更要在不同類型的產品與使用者之間，做出讓人覺得「順手」的東西。期許未來能持續在系統架構與 AI 整合領域發揮影響力。',
];

const AboutMe = () => (
  <section id="about-me" className="home-section about-me-v2">
    <div className="home-section-eyebrow">
      <span className="section-label">About</span>
      <span className="section-eyebrow-count">Koimsurai · 木村盆栽</span>
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