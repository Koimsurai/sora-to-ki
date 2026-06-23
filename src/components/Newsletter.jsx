import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Newsletter.css';

const Newsletter = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState(''); // 'success', 'error', 'loading'
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(t('newsletter.success'));
        setEmail('');
        setName('');
      } else {
        setStatus('error');
        setMessage(data.error || t('newsletter.errorGeneric'));
      }
    } catch (error) {
      setStatus('error');
      setMessage(t('newsletter.errorNetwork'));
      console.error('Newsletter subscription error:', error);
    }
  };

  return (
    <div className="newsletter-container-v2">
      <div className="newsletter-card-v2">
        <div className="newsletter-header-v2">
          <div className="newsletter-icon-v2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h3 className="newsletter-title-v2">{t('newsletter.title')}</h3>
          <p className="newsletter-description-v2">
            {t('newsletter.description')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="newsletter-form-v2">
          <div className="form-group-v2">
            <input
              type="text"
              placeholder={t('newsletter.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="newsletter-input-v2"
              disabled={status === 'loading'}
            />
          </div>
          
          <div className="form-group-v2">
            <input
              type="email"
              placeholder={t('newsletter.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="newsletter-input-v2"
              required
              disabled={status === 'loading'}
            />
          </div>

          <button 
            type="submit" 
            className={`newsletter-submit-v2 ${status}`}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <span className="spinner-v2"></span>
            ) : (
              t('newsletter.submit')
            )}
          </button>
        </form>

        {message && (
          <div className={`newsletter-message-v2 ${status}`}>
            <span>{message}</span>
          </div>
        )}

        <div className="newsletter-footer-v2">
          <p className="newsletter-note-v2">
            {t('newsletter.privacyNote')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Newsletter;