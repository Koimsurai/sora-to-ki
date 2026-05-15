import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import photoMainImage from '../assets/Photo-main.webp';
import './Portfolio.css';

const FEATURE = {
  id: 1,
  category: 'App Development',
  status: 'In Progress',
  title: 'VoltiCar — 碳權電動車 App',
  description:
    '結合碳權概念、電動車充電資訊與遊戲化元素的 App，目標是用便捷與趣味互動鼓勵綠色能源行動。目前已完成後端架構設計與核心 API。',
  imageUrl: 'https://img.youtube.com/vi/eKIJcSIVak0/maxresdefault.jpg',
  link: 'https://www.youtube.com/watch?v=eKIJcSIVak0',
  linkLabel: '▶ 觀看介紹影片',
  external: true,
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
        <ProjectLink item={FEATURE} />
      </div>
    </motion.article>

    <div className="portfolio-secondary-grid">
      {SECONDARY.map((item, i) => (
        <motion.article
          key={item.id}
          className="portfolio-secondary glass-card"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: 'easeOut' }}
        >
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
          <div className="portfolio-secondary-body">
            <span className="section-label">{item.category}</span>
            <h4 className="portfolio-secondary-title">{item.title}</h4>
            <p className="portfolio-secondary-desc">{item.description}</p>
            <div className="portfolio-tags">
              {item.tags.map((t) => (
                <span key={t} className="portfolio-tag">{t}</span>
              ))}
            </div>
            <ProjectLink item={item} />
          </div>
        </motion.article>
      ))}
    </div>
  </section>
);

export default Portfolio;
