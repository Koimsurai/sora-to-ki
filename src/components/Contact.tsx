import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPhone, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import './Contact.css';

const PRIMARY = [
  { key: 'email', icon: faEnvelope, label: 'Email', value: 'timo9378@gmail.com', href: 'mailto:timo9378@gmail.com' },
  { key: 'phone', icon: faPhone,    label: 'Phone', value: '0906-503-623',       href: 'tel:0906503623' },
];

const SOCIAL = [
  { key: 'github',   icon: FaGithub,   href: 'https://github.com/timo9378',           label: 'GitHub' },
  { key: 'linkedin', icon: FaLinkedin, href: 'https://www.linkedin.com/in/timo9378', label: 'LinkedIn' },
];

const Contact = () => {
  const { t } = useTranslation();
  return (
  <section id="contact" className="home-section contact-v2">
    <div className="home-section-eyebrow">
      <span className="section-label">Contact</span>
      <span className="contact-availability">
        <span className="contact-status-dot" />
        Open for opportunities
      </span>
    </div>

    <motion.div
      className="contact-shell"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="contact-pitch">
        <h2 className="section-hero-title contact-title">{t('home.contact.titleLine1')}<br />{t('home.contact.titleLine2')}</h2>
        <p className="contact-blurb">
          {t('home.contact.blurb')}
        </p>
      </div>

      <div className="contact-card glass-card">
        <ul className="contact-methods">
          {PRIMARY.map((m) => (
            <li key={m.key} className="contact-method">
              <span className="contact-method-icon">
                <FontAwesomeIcon icon={m.icon} />
              </span>
              <div className="contact-method-body">
                <span className="section-label">{m.label}</span>
                <a href={m.href} className="contact-method-value">{m.value}</a>
              </div>
            </li>
          ))}
        </ul>

        <div className="contact-social">
          {SOCIAL.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-social-link"
                aria-label={s.label}
              >
                <Icon />
              </a>
            );
          })}
        </div>
      </div>
    </motion.div>
  </section>
  );
};

export default Contact;
