import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import photoMainImage from '../assets/Photo-main.webp';
import './Portfolio.css';

const FEATURE = {
  id: 1,
  category: 'App Development · 專題',
  status: 'In Progress',
  title: 'VoltiCar — 碳權電動車 App',
  description:
    '結合碳權概念、電動車充電資訊與遊戲化元素的 App，目標是用便捷與趣味互動鼓勵綠色能源行動。NTUST IM·IoV 專題系列，包含 Android client、Spring Boot API、Discord Bot 三個 repo。',
  imageUrl: 'https://img.youtube.com/vi/eKIJcSIVak0/maxresdefault.jpg',
  link: 'https://www.youtube.com/watch?v=eKIJcSIVak0',
  linkLabel: '▶ 觀看介紹影片',
  external: true,
  extras: [
    { href: 'https://github.com/ntust-im-iov/VoltiCar',     label: 'Android Repo' },
    { href: 'https://github.com/ntust-im-iov/VoltiCar_API', label: 'API Repo' },
    { href: 'https://github.com/ntust-im-iov/Discord-Bot',  label: 'Discord Bot' },
  ],
  tags: ['Kotlin', 'Spring Boot', 'PostgreSQL', 'Carbon API'],
};

const SECONDARY = [
  {
    id: 2,
    category: 'Web Development',
    title: '個人形象網站（本站）',
    description: '使用 React、Vite 與 CSS 打造，Framer Motion 動效與 Canvas 蟲洞 intro。',
    videoUrl: '/videos/Web_video.mkv',
    link: 'https://github.com/timo9378/web',
    linkLabel: '查看原始碼',
    external: true,
    tags: ['React', 'Vite', 'Canvas'],
  },
  {
    id: 3,
    category: 'Photography',
    title: '個人攝影集錦',
    description: '包含多張個人攝影作品，點擊查看詳情。',
    imageUrl: photoMainImage,
    link: '/photos',
    linkLabel: '查看相簿',
    external: false,
    tags: ['Lightroom', '掃街', '人像'],
  },
  {
    id: 4,
    category: 'Developer Tool',
    title: 'flow2code',
    description: '基於 AST 的視覺化後端邏輯產生器 — 拖拉流程圖節點即可生成可執行程式碼。',
    glyph: '⟁',
    link: 'https://github.com/timo9378/flow2code',
    linkLabel: '查看原始碼',
    external: true,
    tags: ['AST', 'Visual Programming', 'TypeScript'],
  },
  {
    id: 5,
    category: 'Full-Stack · Mobile',
    title: 'Finbox — 自動記帳 App',
    description: '抓 Gmail 通知判斷月訂閱與一次性消費，自動歸類進收支記帳。動機很單純：訂閱多到 Play 商店訂閱管理抓不到，乾脆自己寫一個。',
    glyph: '$',
    link: 'https://github.com/timo9378/Finbox',
    linkLabel: 'Frontend Repo',
    external: true,
    secondaryLink: 'https://github.com/timo9378/finbox-backend',
    secondaryLabel: 'Backend Repo',
    tags: ['Mobile', 'Gmail API', 'Node.js'],
  },
  {
    id: 8,
    category: 'Tool',
    title: 'fakeGPS',
    description: '小工具，模擬 GPS 定位。實作很簡單但意外好用。怎麼用就… 自己想想 :)',
    glyph: '⊙',
    link: 'https://github.com/timo9378/fakeGPS',
    linkLabel: '查看原始碼',
    external: true,
    tags: ['Android', 'Location Mock'],
  },
  {
    id: 6,
    category: 'IoT / Embedded',
    title: 'Pulmote',
    description: 'ESP32 紅外線遙控模擬器與 WiFi bridge — 把舊家電通通接進家庭自動化網路。',
    glyph: '↯',
    link: 'https://github.com/timo9378/Pulmote',
    linkLabel: '查看原始碼',
    external: true,
    tags: ['ESP32', 'C++', 'MQTT', 'IR'],
  },
  {
    id: 7,
    category: 'Self-hosted · Full-Stack',
    title: 'Koimsurai-NAS',
    description: '自架 NAS — 自製前端介面 + 自製 backend，整合相簿 / 影音 / 檔案管理。全部跑在家裡那台機器上。',
    glyph: '◰',
    link: 'https://github.com/timo9378/Koimsurai-NAS',
    linkLabel: 'Frontend Repo',
    external: true,
    secondaryLink: 'https://github.com/timo9378/Koimsurai-NAS-backend',
    secondaryLabel: 'Backend Repo',
    tags: ['React', 'Vite', 'Node.js', 'Self-hosted'],
  },
];

const ProjectLink = ({ item }) => {
  if (!item.link) return null;
  if (item.external) {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="portfolio-link"
      >
        {item.linkLabel}
      </a>
    );
  }
  return <Link to={item.link} className="portfolio-link">{item.linkLabel}</Link>;
};

const Portfolio = () => (
  <section id="portfolio" className="home-section portfolio-v2">
    <div className="home-section-eyebrow">
      <span className="section-label">Selected Work</span>
      <span className="section-eyebrow-count">{1 + SECONDARY.length} projects</span>
    </div>

    <motion.article
      className="portfolio-feature glass-card"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="portfolio-feature-media">
        <img
          src={FEATURE.imageUrl}
          alt={FEATURE.title}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="portfolio-feature-body">
        <div className="portfolio-feature-meta">
          <span className="section-label">{FEATURE.category}</span>
          <span className="portfolio-status">{FEATURE.status}</span>
        </div>
        <h3 className="portfolio-feature-title">{FEATURE.title}</h3>
        <p className="portfolio-feature-desc">{FEATURE.description}</p>
        <div className="portfolio-tags">
          {FEATURE.tags.map((t) => (
            <span key={t} className="portfolio-tag">{t}</span>
          ))}
        </div>
        <div className="portfolio-links">
          <ProjectLink item={FEATURE} />
          {FEATURE.extras && FEATURE.extras.map((ex) => (
            <a
              key={ex.href}
              href={ex.href}
              target="_blank"
              rel="noopener noreferrer"
              className="portfolio-link portfolio-link--secondary"
            >
              {ex.label}
            </a>
          ))}
        </div>
      </div>
    </motion.article>

    <div className="portfolio-secondary-grid">
      {SECONDARY.map((item, i) => {
        const hasMedia = !!(item.videoUrl || item.imageUrl);
        return (
        <motion.article
          key={item.id}
          className={`portfolio-secondary glass-card${hasMedia ? '' : ' portfolio-secondary--code'}`}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: 'easeOut' }}
        >
          {hasMedia ? (
            <div className="portfolio-secondary-media">
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  muted
                  loop
                  playsInline
                  preload="none"
                  controls
                />
              ) : (
                <img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" />
              )}
            </div>
          ) : (
            <div className="portfolio-secondary-glyph" aria-hidden>
              <span>{item.glyph || '◇'}</span>
            </div>
          )}
          <div className="portfolio-secondary-body">
            <span className="section-label">{item.category}</span>
            <h4 className="portfolio-secondary-title">{item.title}</h4>
            <p className="portfolio-secondary-desc">{item.description}</p>
            <div className="portfolio-tags">
              {item.tags.map((t) => (
                <span key={t} className="portfolio-tag">{t}</span>
              ))}
            </div>
            <div className="portfolio-links">
              <ProjectLink item={item} />
              {item.secondaryLink && (
                <a
                  href={item.secondaryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portfolio-link portfolio-link--secondary"
                >
                  {item.secondaryLabel}
                </a>
              )}
            </div>
          </div>
        </motion.article>
        );
      })}
    </div>
  </section>
);

export default Portfolio;
