import { motion } from 'framer-motion';
import './WorkExperience.css';

const EXPERIENCES = [
  {
    period: '2025/7 — Now',
    title: '微星科技股份有限公司',
    role: '軟體工程師',
    tags: ['Monorepo', 'Turborepo', 'TypeScript', 'ASP.NET', 'Python', 'GitLab CI/CD'],
    groups: [
      {
        heading: '前端架構與標準化',
        items: [
          '主導導入 Monorepo 架構：用 Turborepo 整合內部多個前端專案，解決跨專案代碼共用與版控痛點',
          '建立 ESLint / Prettier / TypeScript 嚴格規則，提升團隊代碼品質',
          '封裝共用 UI Library 與 Utility Libraries，提供其他團隊（如 IT Team）復用',
          '撰寫標準化開發文件與 README，協助團隊成員上手新架構',
        ],
      },
      {
        heading: '後端開發與維護',
        items: [
          '維護 ASP.NET (C#) 與 Legacy Web API，解決 .NET Framework 相容性與 .web.config 配置問題',
          '處理 MS SQL 資料庫權限控管與 Stored Procedure 邏輯除錯',
          '用 Python 撰寫網頁爬蟲與自動化腳本，協助資料收集與批次處理',
        ],
      },
      {
        heading: 'DevOps 與流程優化',
        items: [
          '參與 GitLab CI/CD Pipeline 建置與維護，確保 Monorepo 自動化建置部署流暢',
          '熟悉 Git Flow，協助團隊解決版本衝突與 Merge Request Code Review',
        ],
      },
      {
        heading: '跨部門協作',
        items: [
          '與 AI Team / IT Team 緊密合作，作為前端技術窗口整合 AI 模型至 Web 介面',
          '向主管與非技術人員 demo，將複雜架構概念轉化為具體效益',
        ],
      },
    ],
  },
  {
    period: '2024/9 — Now',
    title: '猿創力程式設計學校',
    role: '儲備講師',
    tags: ['Python', 'Scratch', 'MCE', 'App Inventor'],
    bullets: [
      '教導國中、國小學生程式，小班制 MCE、Python 為主',
      'App Inventor 到府一對一比賽特訓班',
    ],
  },
  {
    period: '2024/10 — 2025/6',
    title: '私立高偉數學補習班',
    role: '資訊助理 & 企劃部門',
    tags: ['Kotlin', 'Android', 'Premiere Pro'],
    bullets: [
      '開發補習班 Android App 並上線維運',
      '完成主管交辦的其他資訊事務',
      '剪輯數十支 10 分鐘內宣傳影片、製作封面',
    ],
  },
];

const WorkExperience = () => (
  <section id="work-experience" className="home-section work-v2">
    <div className="home-section-eyebrow">
      <span className="section-label">Experience</span>
      <span className="section-eyebrow-count">{EXPERIENCES.length} roles</span>
    </div>

    <div className="work-timeline">
      {EXPERIENCES.map((exp, i) => (
        <motion.article
          key={exp.title}
          className="work-entry"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
        >
          <aside className="work-rail">
            <span className="work-rail-dot" />
            <time className="work-period">{exp.period}</time>
          </aside>

          <div className="work-card glass-card">
            <header className="work-card-head">
              <h3 className="work-card-title">{exp.title}</h3>
              <span className="work-card-role">{exp.role}</span>
            </header>

            {exp.tags && (
              <div className="work-tags">
                {exp.tags.map((t) => <span key={t} className="work-tag">{t}</span>)}
              </div>
            )}

            {exp.groups && (
              <div className="work-groups">
                {exp.groups.map((g) => (
                  <div key={g.heading} className="work-group">
                    <span className="section-label work-group-label">{g.heading}</span>
                    <ul className="work-bullets">
                      {g.items.map((it, j) => <li key={j}>{it}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {exp.bullets && (
              <ul className="work-bullets work-bullets-flat">
                {exp.bullets.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            )}
          </div>
        </motion.article>
      ))}
    </div>
  </section>
);

export default WorkExperience;
