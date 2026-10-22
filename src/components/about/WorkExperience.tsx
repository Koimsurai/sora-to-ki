import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import './WorkExperience.css';
import { lookupOr } from '@/lib/tableLookup';
import { PERIODS, TAGS, EXPERIENCES_BY_LANG } from '@/data/aboutData';

const WorkExperience = () => {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const list = lookupOr(EXPERIENCES_BY_LANG, lang, EXPERIENCES_BY_LANG['zh-TW']);
  const EXPERIENCES = list.map((e, i) => ({ ...e, period: PERIODS[i], tags: TAGS[i] }));
  return (
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

              {exp.tags.length > 0 && (
                <div className="work-tags">
                  {exp.tags.map((t) => (
                    <span key={t} className="work-tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {exp.groups && (
                <div className="work-groups">
                  {exp.groups.map((g) => (
                    <div key={g.heading} className="work-group">
                      <span className="section-label work-group-label">{g.heading}</span>
                      <ul className="work-bullets">
                        {g.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {exp.bullets && (
                <ul className="work-bullets work-bullets-flat">
                  {exp.bullets.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
};

export default WorkExperience;
