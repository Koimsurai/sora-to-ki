import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FaHome, FaPlug } from 'react-icons/fa';
import NebulaBackground from '@/components/backdrop/NebulaBackground';
import { enterStyle } from '@/lib/enter';
import SetupNeofetch from './SetupNeofetch';
import SetupTopology from './SetupTopology';
import { GEAR, BASE_II_SPECS, APPLIANCES, type GearFilter, type GearItem } from './setupGear';
import './Setup.css';

const FILTERS: GearFilter[] = ['all', ...GEAR.map((c) => c.id), 'base-ii'];

/** 拓撲圖跳過來時卡片亮多久 */
const FLASH_MS = 1600;

function GearCard({ item, flashing }: { item: GearItem; flashing: boolean }) {
  const { t } = useTranslation();
  return (
    <article id={`gear-${item.id}`} className={`setup-card${flashing ? ' is-flash' : ''}`}>
      <div className="setup-card-media">
        {item.image ? (
          <img src={item.image} alt="" className="setup-card-image" loading="lazy" decoding="async" />
        ) : (
          <span className="setup-card-placeholder" aria-hidden="true">
            <FaPlug />
          </span>
        )}
      </div>
      <h3 className="setup-card-name">{item.name}</h3>
      <p className="setup-card-spec">{item.spec}</p>
      {item.roleKey && <p className="setup-card-role">{t(`setup.roles.${item.roleKey}`)}</p>}
    </article>
  );
}

function Setup() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<GearFilter>('all');
  const [flash, setFlash] = useState<string | null>(null);

  // 家電沒有卡片，但也算在設備數與智慧家庭裝置數裡
  const total = GEAR.reduce((sum, c) => sum + c.items.length, 0) + APPLIANCES.length;
  const iot = (GEAR.find((c) => c.id === 'smart-home')?.items.length ?? 0) + APPLIANCES.length;
  const shown = (id: GearFilter) => filter === 'all' || filter === id;

  // 拓撲圖的節點：目標可能被目前的篩選藏起來，先切回「全部」，等它畫出來再捲過去
  const navigate = useCallback((anchor: string) => {
    setFilter('all');
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlash(anchor);
    });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return (
    <div className="setup-page">
      {/* 跟書櫃、音樂頁同一層深空暗幕：蓋在 3D 星空前面，字才讀得清楚 */}
      <NebulaBackground />
      <div className="setup-wrap">
        <SetupNeofetch total={total} iot={iot} cwd={filter} onCd={setFilter} />

        {/* 首屏的進場用 CSS（.enter），不等 JS；下面各分類捲到才出現，仍用 framer 的 whileInView */}
        <div className="enter" style={enterStyle({ delay: 150 })}>
          <SetupTopology onNavigate={navigate} />
        </div>

        <fieldset className="setup-chips enter" style={enterStyle({ delay: 300, y: 12, dur: 500 })}>
          <legend className="sr-only">{t('setup.filter')}</legend>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="setup-chip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('common.all') : t(`setup.cat.${f}.short`)}
            </button>
          ))}
        </fieldset>

        {GEAR.filter((c) => shown(c.id)).map((cat) => (
          <motion.section
            key={cat.id}
            id={`gear-cat-${cat.id}`}
            className={`setup-section${flash === `gear-cat-${cat.id}` ? ' is-flash' : ''}`}
            aria-labelledby={`gear-cat-${cat.id}-title`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
          >
            <header className="setup-section-head">
              <span className="setup-section-no">{String(GEAR.indexOf(cat) + 1).padStart(2, '0')}</span>
              <h2 id={`gear-cat-${cat.id}-title`} className="setup-section-title">
                {t(`setup.cat.${cat.id}.short`)}
                <span className="setup-section-en">{cat.name}</span>
              </h2>
              <p className="setup-section-desc">{t(`setup.cat.${cat.id}.desc`)}</p>
            </header>
            <div className="setup-grid">
              {cat.items.map((item) => (
                <GearCard key={item.id} item={item} flashing={flash === `gear-${item.id}`} />
              ))}
            </div>
            {cat.id === 'smart-home' && (
              <div id="gear-appliances" className={`setup-appliances${flash === 'gear-appliances' ? ' is-flash' : ''}`}>
                <h3 className="setup-appliances-title">{t('setup.appliances.title')}</h3>
                <ul className="setup-appliances-list">
                  {APPLIANCES.map((a) => (
                    <li key={`${a.name}-${a.typeKey}`}>
                      <span className="setup-appliances-name">{a.name}</span>
                      <span className="setup-appliances-type">{t(`setup.appliances.types.${a.typeKey}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>
        ))}

        {shown('base-ii') && (
          <motion.section
            id="gear-cat-base-ii"
            className="setup-section"
            aria-labelledby="gear-cat-base-ii-title"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
          >
            <header className="setup-section-head">
              <span className="setup-section-no">{String(GEAR.length + 1).padStart(2, '0')}</span>
              <h2 id="gear-cat-base-ii-title" className="setup-section-title">
                {t('setup.cat.base-ii.short')}
                <span className="setup-section-en">Base II</span>
              </h2>
              <p className="setup-section-desc">{t('setup.cat.base-ii.desc')}</p>
            </header>
            <div className="setup-base">
              <FaHome className="setup-base-icon" aria-hidden="true" />
              <p className="setup-base-quote">
                “Built from spare parts and memories. Ready for action whenever I return home.”
              </p>
              <dl className="setup-base-specs">
                {BASE_II_SPECS.map((s) => (
                  <div key={s.label} className="setup-base-row">
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="setup-base-retired">
                <span className="setup-base-retired-tag">{t('setup.retired')}</span>
                {t('setup.retiredText')}
              </p>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
}

export default Setup;
