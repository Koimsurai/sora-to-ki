// 設備頁 HOME SERVER 那張圖紙右邊的遙測：這台伺服器（跑著這個網站的那台）回傳的幾個即時數字，
// 像太空船傳回地面的遙測一樣每 30 秒更新一次。刻意只有溫度、負載、記憶體、功耗（見 backend handlers::telemetry）。
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { telemetryQueryOptions } from '@/data/telemetryData';

const show = (v: number | null | undefined, unit: string) => (v == null ? '—' : `${v} ${unit}`);

export default function TelemetryPanel() {
  const { t } = useTranslation();
  const { data, dataUpdatedAt } = useQuery(telemetryQueryOptions);
  const live = data != null && Object.values(data).some((v) => v != null);
  return (
    <section className="su-telemetry" aria-label={t('setup.sheet.telemetry')}>
      <header>
        {/* 每收到一次就閃一下：key 換了，動畫重來 */}
        <i key={dataUpdatedAt} className={live ? 'is-live' : undefined} aria-hidden="true" />
        <span>TELEMETRY · DOWNLINK</span>
      </header>
      <dl>
        <div>
          <dt>TEMP</dt>
          <dd>{show(data?.cpuTemp, '°C')}</dd>
        </div>
        <div>
          <dt>LOAD</dt>
          <dd>{show(data?.load, '%')}</dd>
        </div>
        <div>
          <dt>MEM</dt>
          <dd>{show(data?.memory, '%')}</dd>
        </div>
        <div>
          <dt>POWER</dt>
          <dd>{show(data?.power, 'W')}</dd>
        </div>
      </dl>
      <p>{live ? t('setup.sheet.telemetryEvery') : t('setup.sheet.telemetryWait')}</p>
    </section>
  );
}
