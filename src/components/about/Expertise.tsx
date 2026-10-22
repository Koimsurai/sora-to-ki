import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import './Expertise.css';
import { lookupOr } from '@/lib/tableLookup';
import { NAMES_BY_LANG, CATEGORIES_BASE } from '@/data/aboutData';
import { ICON_MAP } from '@/data/skillIcons';

// 中文名稱 per locale。label 是英文鍵,items 是技術名（不翻）。
const HERO_BY_LANG: Record<string, { line1: string; line2: string }> = {
  'zh-TW': { line1: '從前端到部署、從設計到教學。', line2: '每一層都能自己接起來。' },
  'zh-CN': { line1: '从前端到部署、从设计到教学。', line2: '每一层都能自己接起来。' },
  en: { line1: 'From frontend to deploy, from design to teaching.', line2: 'Every layer, I can wire it myself.' },
  ja: { line1: 'フロントエンドからデプロイまで、デザインから教育まで。', line2: 'どの層も自分で繋げられる。' },
  ko: { line1: '프런트엔드부터 배포까지, 디자인부터 교육까지.', line2: '모든 레이어를 직접 연결할 수 있어요.' },
};

const CATEGORIES = CATEGORIES_BASE; // 元件 render 時用 i18n 動態接 name

const TOTAL = CATEGORIES.reduce((sum, c) => sum + c.items.length, 0);

const SkillIcon = ({ name }: { name: string }) => {
  const entry = ICON_MAP[name];
  if (!entry) return null;
  const [Icon, color] = entry;
  return (
    <span className="skill-chip" title={name} aria-label={name}>
      <Icon className="skill-chip-icon" style={{ color }} />
    </span>
  );
};

// Auto-scrolling marquee for long lists; static row for short ones so
// the loop doesn't visibly repeat the same icons within the viewport.
const MIN_FOR_MARQUEE = 7;

const MarqueeRow = ({ items, reverse, duration }: { items: string[]; reverse?: boolean; duration: number }) => (
  <div className="expertise-marquee-wrap">
    <div
      className="expertise-marquee-track"
      style={{
        animationDuration: `${duration}s`,
        animationDirection: reverse ? 'reverse' : 'normal',
      }}
    >
      {[...items, ...items].map((item, i) => (
        // 跑馬燈把 items 接兩份 → 同名項目必然重複，只能靠 index 區分前後兩份
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <SkillIcon key={`${item}-${i}`} name={item} />
      ))}
    </div>
  </div>
);

const StaticRow = ({ items }: { items: string[] }) => (
  <div className="expertise-static-row">
    {items.map((item) => (
      <SkillIcon key={item} name={item} />
    ))}
  </div>
);

function Expertise() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const names = lookupOr(NAMES_BY_LANG, lang, NAMES_BY_LANG['zh-TW']);
  const hero = lookupOr(HERO_BY_LANG, lang, HERO_BY_LANG['zh-TW']);
  return (
    <section id="expertise" className="home-section expertise-v2">
      <div className="home-section-eyebrow">
        <span className="section-label">Stack</span>
        <span className="section-eyebrow-count">
          {CATEGORIES.length} domains · {TOTAL} technologies
        </span>
      </div>

      <div className="expertise-grid">
        <motion.div
          className="expertise-hero"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="expertise-hero-number">{TOTAL}</span>
          <span className="expertise-hero-unit">technologies</span>
          <p className="expertise-hero-blurb">
            {hero.line1}
            <br />
            {hero.line2}
          </p>
        </motion.div>

        <div className="expertise-rows">
          {CATEGORIES.map((cat, i) => {
            const useMarquee = cat.items.length >= MIN_FOR_MARQUEE;
            const duration = Math.max(22, cat.items.length * 3.2);
            return (
              <motion.div
                key={cat.label}
                className="expertise-row"
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: 'easeOut' }}
              >
                <div className="expertise-row-label">
                  <span className="section-label">{cat.label}</span>
                  <span className="expertise-row-name">{names[cat.label]}</span>
                </div>
                {useMarquee ? (
                  <MarqueeRow items={cat.items} reverse={i % 2 === 1} duration={duration} />
                ) : (
                  <StaticRow items={cat.items} />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Expertise;
