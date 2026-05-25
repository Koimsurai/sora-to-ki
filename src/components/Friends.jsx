import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';
import InfoPage from './InfoPage';

/**
 * 友鏈列表 — 之後手動加，格式：{ name, url, avatar, tagline }
 * 還沒人就讓它空著，頁面會顯示「歡迎成為第一個」。
 */
const FRIENDS = [];

const FAILED = [];        // 失聯的（網站掛了/換域名等）
const BLACKLIST = [];     // 黑名單（違規/變廣告農場）

// 本站訊息卡 — 給對方寫進他們的友鏈頁
const SITE_INFO = {
  name: '宙と木',
  url: 'https://koimsurai.com',
  desc: '一個工程師的個人空間',
  // 永久分享連結（自製 NAS）— 如果 NAS 掛了/重開後失效，把這個換掉
  avatar: 'https://nas.koimsurai.com/s/99881e40-51d4-4ea2-8dbd-47692f6343ff',
};

function ApplicationForm({ onClose }) {
  const [form, setForm] = useState({
    name: '', site: '', url: '', avatar: '', email: '', tagline: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // 沒做後端 API，submit 後組 mailto: 連結讓使用者開信件用戶端寄出
    const subject = `[友鏈申請] ${form.site || form.name}`;
    const body = [
      `名字：${form.name}`,
      `站點名稱：${form.site}`,
      `網站：${form.url}`,
      `頭像：${form.avatar}`,
      `Email：${form.email}`,
      `一句自介：${form.tagline}`,
    ].join('\n');
    const mailto = `mailto:timo9378@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSubmitted(true);
    // 給點時間讓使用者看到「已送出」回饋再開信件用戶端
    setTimeout(() => {
      window.location.href = mailto;
    }, 400);
  };

  return (
    <motion.div
      className="friends-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="friends-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="friends-modal-header">
          <h3>來自網海的問候</h3>
          <button type="button" className="friends-modal-close" onClick={onClose} aria-label="關閉">
            <FaTimes />
          </button>
        </div>

        {submitted ? (
          <div className="friends-modal-success">
            <p>已準備好你的訊息，正在開啟信件用戶端…</p>
            <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>
              如果沒有自動開啟，可以直接寄到 <code>timo9378@gmail.com</code>。
            </p>
            <button type="button" className="friends-modal-submit" onClick={onClose}>
              關閉
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="friends-modal-form">
            <div className="friends-modal-grid">
              <label className="friends-modal-field">
                <span>你的名字 <span className="req">*</span></span>
                <input
                  type="text" required value={form.name} onChange={update('name')}
                  placeholder="Koimsurai"
                />
              </label>
              <label className="friends-modal-field">
                <span>站點名稱 <span className="req">*</span></span>
                <input
                  type="text" required value={form.site} onChange={update('site')}
                  placeholder="宙と木"
                />
              </label>
              <label className="friends-modal-field">
                <span>網站連結 <span className="req">*</span></span>
                <input
                  type="url" required value={form.url} onChange={update('url')}
                  placeholder="https://"
                />
              </label>
              <label className="friends-modal-field">
                <span>頭像連結 <span className="req">*</span></span>
                <input
                  type="url" required value={form.avatar} onChange={update('avatar')}
                  placeholder="https://"
                />
              </label>
              <label className="friends-modal-field friends-modal-field--full">
                <span>Email <span className="req">*</span></span>
                <input
                  type="email" required value={form.email} onChange={update('email')}
                  placeholder="me@example.com"
                />
              </label>
              <label className="friends-modal-field friends-modal-field--full">
                <span>一句自介 <span className="req">*</span></span>
                <input
                  type="text" required value={form.tagline} onChange={update('tagline')}
                  placeholder="想說什麼都可以，30 字以內"
                  maxLength={50}
                />
              </label>
            </div>

            <div className="friends-modal-actions">
              <button type="submit" className="friends-modal-submit">送出</button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

function Friends() {
  const [showForm, setShowForm] = useState(false);

  return (
    <InfoPage
      title="朋友們"
      subtitle="海內存知己，天涯若比鄰"
      slug="friends"
      prev={null}
      next={null}
    >
      <p>
        友鏈的中文圈起源像是古早 SEO 時代「我貼你、你貼我」的互助文化。
        對我來說更像「我在這片網海裡看見了你，幫你掛個牌子」。
      </p>

      <h2 id="list">目前的朋友</h2>

      {FRIENDS.length === 0 ? (
        <p style={{ color: 'rgba(229,229,245,0.5)', fontStyle: 'italic' }}>
          ── 還沒有人，這裡空著。歡迎成為第一個。 ──
        </p>
      ) : (
        <div className="friends-grid">
          {FRIENDS.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="friend-card"
            >
              <img src={f.avatar} alt="" width="40" height="40" className="friend-card-avatar" loading="lazy" />
              <div className="friend-card-info">
                <div className="friend-card-name">{f.name}</div>
                <div className="friend-card-tagline">{f.tagline}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {FAILED.length > 0 && (
        <>
          <h3 id="failed">以下站點無法訪問，已失聯</h3>
          <ul>
            {FAILED.map((f) => <li key={f.name}>{f.name} — {f.url}</li>)}
          </ul>
        </>
      )}

      {BLACKLIST.length > 0 && (
        <>
          <h3 id="blacklist">以下站點不合規，已被禁止</h3>
          <ul>
            {BLACKLIST.map((f) => <li key={f.name}>{f.name} — {f.reason}</li>)}
          </ul>
        </>
      )}

      <h2 id="apply">想交換友鏈？</h2>
      <p>幾個小前提：</p>
      <ol>
        <li>站點目前能正常瀏覽（沒過期 / 沒掛掉）。</li>
        <li>有原創內容（轉貼站、純廣告、SEO 農場恕不交換）。</li>
        <li>HTTPS、有自己的域名（不限 .com / .tw / .moe，免費 subdomain 也可）。</li>
        <li>如果你願意先在你站上掛我的連結，我會更快回覆。</li>
      </ol>

      <p>本站的訊息卡：</p>
      <ul>
        <li>站點名稱：<code>{SITE_INFO.name}</code></li>
        <li>站點地址：<code>{SITE_INFO.url}</code></li>
        <li>站點描述：{SITE_INFO.desc}</li>
        <li>頭像：<a href={SITE_INFO.avatar} target="_blank" rel="noopener noreferrer"><code>連結</code></a></li>
      </ul>

      <p>
        想申請的話，可以點下方按鈕填表（會幫你開信件用戶端寄出），或直接到{' '}
        <Link to="/messages">留言頁</Link>{' '}
        留言、寄信到 <a href="mailto:timo9378@gmail.com">timo9378@gmail.com</a>。
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          className="friends-apply-btn"
          onClick={() => setShowForm(true)}
        >
          來交個朋友
        </button>
      </div>

      <AnimatePresence>
        {showForm && <ApplicationForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </InfoPage>
  );
}

export default Friends;
