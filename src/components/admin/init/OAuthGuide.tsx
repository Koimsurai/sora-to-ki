import { useState } from 'react';
import { useAdminT } from '@/i18n/admin-i18n';

// 「認領站長」那一步的設定教學：還沒設好的那一家，一步一步帶著做。
// 網址都是用這個站自己的 SITE_URL 組好的，照抄就對。

function Copyable({ label, value }: { label?: string; value: string }) {
  const { t } = useAdminT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="wz-copy">
      {label && <span className="wz-copy-label">{label}</span>}
      <code className="wz-copy-value">{value}</code>
      <button type="button" className="wz-copy-btn" onClick={copy}>
        {copied ? t('init.copied') : t('init.copy')}
      </button>
    </div>
  );
}

const RESTART = 'docker compose up -d --force-recreate backend-rs';

export default function OAuthGuide({ provider, url }: { provider: 'github' | 'google'; url: string }) {
  const { t } = useAdminT();
  const callback = `${url}/auth/callback`;
  const k = (s: string) => t(`init.owner.guide.${provider}.${s}`);

  if (provider === 'github') {
    return (
      <ol className="wz-guide">
        <li>
          <p>{k('s1')}</p>
          <a className="wz-link" href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer">
            github.com/settings/applications/new ↗
          </a>
        </li>
        <li>
          <p>{k('s2')}</p>
          <Copyable label={k('homepage')} value={url} />
          <Copyable label={k('callback')} value={callback} />
        </li>
        <li>
          <p>{k('s3')}</p>
        </li>
        <li>
          <p>{k('s4')}</p>
          <pre className="wz-cmd">{'GITHUB_CLIENT_ID=…\nGITHUB_CLIENT_SECRET=…'}</pre>
        </li>
        <li>
          <p>{k('s5')}</p>
          <Copyable value={RESTART} />
        </li>
      </ol>
    );
  }
  return (
    <ol className="wz-guide">
      <li>
        <p>{k('s1')}</p>
        <a className="wz-link" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
          console.cloud.google.com/auth/overview ↗
        </a>
      </li>
      <li>
        <p>{k('s2')}</p>
      </li>
      <li>
        <p>{k('s3')}</p>
      </li>
      <li>
        <p>{k('s4')}</p>
        <Copyable label={k('origins')} value={url} />
        <Copyable label={k('redirects')} value={callback} />
      </li>
      <li>
        <p>{k('s5')}</p>
        <pre className="wz-cmd">{'GOOGLE_CLIENT_ID=…\nGOOGLE_CLIENT_SECRET=…'}</pre>
      </li>
      <li>
        <p>{k('s6')}</p>
        <Copyable value={RESTART} />
      </li>
    </ol>
  );
}
