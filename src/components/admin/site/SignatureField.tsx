import { useState } from 'react';

import { useAdminT } from '@/i18n/admin-i18n';
import '@/components/common/SignatureSVG.css';
import { signatureFromSvg } from './signature';
import { NO_SIGNATURE, type Draft } from './siteDraft';

type Patch = (p: Partial<Draft>) => void;

/**
 * 文末簽名：上傳一個 SVG，照檔案裡的順序一筆一筆寫出來（前台的 SignatureSVG）。
 * 沒上傳就不顯示。這裡只畫寫好的樣子（不跑筆尖），讓站長看一眼對不對。
 */
export default function SignatureField({ draft, patch }: { draft: Draft; patch: Patch }) {
  const { t } = useAdminT();
  const [error, setError] = useState<string | null>(null);
  const sig = draft.signature;
  const has = sig.steps.length > 0;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const parsed = signatureFromSvg(await file.text());
    if (!parsed) {
      setError(t('site.identity.signatureUnusable'));
      return;
    }
    setError(null);
    patch({ signature: parsed });
  };

  return (
    <div className="sf-field sf-signature">
      <span className="sf-label">
        {t('site.identity.signature')}
        <em> · {t('site.identity.optional')}</em>
      </span>
      {has ? (
        <div className="sf-signature-preview signature-svg-container">
          <svg viewBox={sig.view_box} className="is-written" aria-hidden="true">
            {sig.steps.map((s, i) =>
              s.kind === 'stroke' ? (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- 筆畫沒有自己的 id，順序就是身分
                <path key={i} className="signature-path" d={s.d} />
              ) : (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- 同上
                <circle key={i} className="signature-dot" cx={s.x ?? 0} cy={s.y ?? 0} r="7" />
              ),
            )}
          </svg>
        </div>
      ) : (
        <p className="sf-hint">{t('site.identity.signatureNone')}</p>
      )}
      <div className="sf-signature-actions">
        <label className="adm-btn adm-btn-small">
          {has ? t('site.identity.signatureReplace') : t('site.identity.signatureUpload')}
          <input
            type="file"
            accept=".svg,image/svg+xml"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {has && (
          <button type="button" className="adm-btn adm-btn-small" onClick={() => patch({ signature: NO_SIGNATURE })}>
            {t('site.identity.signatureRemove')}
          </button>
        )}
      </div>
      <p className="sf-hint">{t('site.identity.signatureHint')}</p>
      {error && (
        <span className="sf-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
