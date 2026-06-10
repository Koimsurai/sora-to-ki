// 成長軌跡 — 精簡編輯版（取代舊 /journey 的一屏一里程碑排場，併入 /about）。
// 視覺沿用 WorkExperience 的 rail 語言：左欄年份 + 線上彩色光點，右欄玻璃內容。
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { YEAR_LABELS, JOURNEY_UI, MILESTONE_STATIC, MILESTONES_BY_LANG } from '../data/journeyData';
import './JourneyTimeline.css';

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: 'easeOut' },
};

function JourneyTimeline() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'zh-TW';
  const ylabels = YEAR_LABELS[lang] || YEAR_LABELS['zh-TW'];
  const ui = JOURNEY_UI[lang] || JOURNEY_UI['zh-TW'];
  const locale = MILESTONES_BY_LANG[lang] || MILESTONES_BY_LANG['zh-TW'];
  const milestones = MILESTONE_STATIC.map((s, i) => ({
    ...s,
    year: s.year === 'NOW' ? ylabels.NOW : s.year === 'FUTURE' ? ylabels.FUTURE : s.year,
    isFuture: s.year === 'FUTURE',
    ...locale[i],
    allTags: [...s.tags, ...(locale[i].extraTags || [])],
  }));

  return (
    <section id="journey" className="home-section journey-v2">
      <div className="home-section-eyebrow">
        <span className="section-label">Journey</span>
        <span className="section-eyebrow-count">{ui.title}</span>
      </div>

      <div className="jt-timeline">
        {milestones.map((m, i) => (
          <motion.div className={`jt-entry ${m.isFuture ? 'jt-entry--future' : ''}`} key={m.id} {...reveal} transition={{ ...reveal.transition, delay: Math.min(i * 0.05, 0.3) }}>
            <aside className="jt-rail">
              <span className="jt-rail-dot" style={{ '--dot': m.color }} />
              <span className="jt-year">{m.year}</span>
            </aside>
            <div className="jt-card glass-card">
              <h3 className="jt-title">{m.title}</h3>
              <p className="jt-subtitle">{m.subtitle}</p>
              <p className="jt-desc">{m.description}</p>
              {m.allTags.length > 0 && (
                <div className="jt-tags">
                  {m.allTags.map((t) => <span className="jt-tag" key={t}>{t}</span>)}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="jt-ending">{ui.endingTitle}</p>
    </section>
  );
}

export default JourneyTimeline;
