import { useTranslation } from 'react-i18next';
import { enterStyle } from '@/lib/enter';
import './AboutMe.css';
import { lookupOr } from '@/lib/tableLookup';
import { QUICK_FACTS_BY_LANG, PARAGRAPHS_BY_LANG } from '@/data/aboutData';

const AboutMe = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const QUICK_FACTS = lookupOr(QUICK_FACTS_BY_LANG, lang, QUICK_FACTS_BY_LANG['zh-TW']);
  const PARAGRAPHS = lookupOr(PARAGRAPHS_BY_LANG, lang, PARAGRAPHS_BY_LANG['zh-TW']);
  return (
    <section id="about-me" className="home-section about-me-v2">
      <div className="home-section-eyebrow">
        <span className="section-label">About</span>
        <span className="section-eyebrow-count">{t('home.aboutMe.eyebrow')}</span>
      </div>

      <div className="about-grid">
        {/* /about 的第一段，在首屏裡：進場用 CSS（.enter），不用等 JS 跟 whileInView。
            下面幾段（Expertise 之後）捲到才出現，維持 framer。 */}
        <div className="about-bio enter" style={enterStyle({ y: 16 })}>
          <h2 className="section-hero-title">
            {t('home.aboutMe.titleLine1')}
            <br />
            {t('home.aboutMe.titleLine2')}
          </h2>
          {PARAGRAPHS.map((p) => (
            <p key={p} className="about-paragraph">
              {p}
            </p>
          ))}
        </div>

        <aside className="about-facts glass-card enter" style={enterStyle({ delay: 100, y: 16 })}>
          <span className="section-label about-facts-label">Quick Facts</span>
          <dl>
            {QUICK_FACTS.map((f) => (
              <div key={f.label} className="about-fact-row">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </section>
  );
};

export default AboutMe;
