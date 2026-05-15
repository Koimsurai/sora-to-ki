import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUniversity, FaGuitar, FaCamera } from 'react-icons/fa';
import './SchoolClubs.css';

const CLUBS = [
  {
    name: '111 屆資管系學會',
    role: '會長',
    period: '2022 — 2023',
    icon: FaUniversity,
    activities: [
      '宿營 活動副組長',
      '迎新茶會 總召、主持人',
      '十三系聯合聖誕夜店趴 副召',
      '系座談會 總召、主持人',
    ],
  },
  {
    name: '112 屆絃韻吉他社',
    role: '文書',
    period: '2023 — 2024',
    icon: FaGuitar,
    activities: [
      '吉他太美（迎新） 總召',
      '詐騙吉團（期初） 攝影',
      '吉拜郎（民歌之夜） 副召、攝影',
      '七校聯展 協辦',
      '吉卜力（社友會） 場佈、主持人',
      '吉良吉影（期末） 公關組長、攝影組長',
      '吉惡世代（期初下） 副召、主持人',
      '金絃獎 文宣、內招組長',
    ],
  },
  {
    name: '第一屆台科攝影社',
    role: '教學',
    period: '2023 — 2024',
    icon: FaCamera,
    activities: [
      '社課教學與規劃',
      '外拍活動帶領',
    ],
  },
];

function SchoolClubs() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id="school-clubs" className="home-section clubs-v2">
      <div className="home-section-eyebrow">
        <span className="section-label">Communities</span>
        <span className="section-eyebrow-count">{CLUBS.length} 社團幹部</span>
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
                  <span className="club-period">{club.period}</span>
                </div>
                <div className="club-role-badge">{club.role}</div>
                <span className="club-count">
                  {club.activities.length} 活動
                  <span className={`club-caret ${isOpen ? 'open' : ''}`}>▾</span>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    key="activities"
                    className="club-activities-list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                  >
                    {club.activities.map((a, j) => (
                      <li key={j} className="club-activity-item">{a}</li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export default SchoolClubs;
