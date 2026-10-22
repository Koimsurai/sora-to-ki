import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaUniversity, FaGuitar, FaCamera } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import './SchoolClubs.css';
import { lookupOr } from '@/lib/tableLookup';
import { CLUB_PERIODS, CLUBS_BY_LANG } from '@/data/aboutData';

// 圖示穩定，期間與 name/role/activities 在 data/aboutData
const CLUB_ICONS = [FaUniversity, FaGuitar, FaCamera];
function SchoolClubs() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const CLUBS = lookupOr(CLUBS_BY_LANG, lang, CLUBS_BY_LANG['zh-TW']).map((c, i) => ({
    ...c,
    icon: CLUB_ICONS[i],
    period: CLUB_PERIODS[i],
  }));
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="school-clubs" className="home-section clubs-v2">
      <div className="home-section-eyebrow">
        <span className="section-label">Communities</span>
        <span className="section-eyebrow-count">
          {CLUBS.length} {t('home.schoolClubs.eyebrowSuffix')}
        </span>
      </div>

      <div className="clubs-list">
        {CLUBS.map((club, i) => {
          const Icon = club.icon;
          const isOpen = openIndex === i;
          return (
            <motion.div
              key={club.name}
              className={`club-row glass-card ${isOpen ? 'open' : ''}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: 'easeOut' }}
            >
              <button
                type="button"
                className="club-row-head"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="club-icon-wrap">
                  <Icon />
                </span>
                <div className="club-meta">
                  <span className="club-name">{club.name}</span>
                  <span className="club-role-badge">{club.role}</span>
                </div>
                <span className="club-period">{club.period}</span>
                <span className="club-count">
                  {club.activities.length} {t('home.schoolClubs.activitiesLabel')}
                  <span className={`club-caret ${isOpen ? 'open' : ''}`}>▾</span>
                </span>
              </button>

              {/* 展開動畫：CSS grid-rows 0fr→1fr（framer 的 height:auto 量測會卡） */}
              <div className={`club-activities-wrap ${isOpen ? 'open' : ''}`}>
                <ul className="club-activities-list">
                  {club.activities.map((a) => (
                    <li key={a} className="club-activity-item">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export default SchoolClubs;
