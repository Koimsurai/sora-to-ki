// 設備頁的開頭：一個終端機視窗跑 neofetch。r/unixporn 那類社群秀配備就是這個樣子，
// 而這個網站本身就跑在這台伺服器上，所以提示字元是 koimsurai@home-server。
//
// 欄位名照 neofetch 原樣用英文；值是這台伺服器的實際規格（2026-10 抄的），換硬體要回來改。
// Packages 那行借來放設備數——neofetch 本來是數套件，這裡數的是「裝了多少東西」。
import { useTranslation } from 'react-i18next';

/**
 * neofetch 左邊放發行版標誌的位置：一個像素風的 K。
 *
 * ⚠ 不要改回用方塊字元（█╗╔╝）拼：站上沒有載入任何等寬 webfont，那些框線字元會落到
 * 寬度不一的備用字體，實測直接拼歪。用 SVG 方塊畫，每台機器都長一樣。
 */
const LOGO = [
  '##....##',
  '##...##.',
  '##..##..',
  '##.##...',
  '####....',
  '##.##...',
  '##..##..',
  '##...##.',
  '##....##',
];
const PX = 10;
/** 有填色的格子，座標本身當 key（圖案固定不變） */
const PIXELS = LOGO.flatMap((row, y) =>
  row.split('').flatMap((c, x) => (c === '#' ? [{ id: `${x},${y}`, x, y }] : [])),
);

const SPECS: [string, string][] = [
  ['OS', 'Ubuntu 24.04 LTS x86_64'],
  ['Kernel', 'Linux 7.0'],
  ['CPU', 'AMD Ryzen 7 8700G (16)'],
  ['GPU', 'NVIDIA RTX 5060 Ti 16GB'],
  ['Memory', '64 GiB DDR5-5600'],
  ['Disk', '2TB NVMe · 32TB HDD pool'],
  ['Containers', '80+ · Home Assistant · Matter · this site'],
];

/** neofetch 最後那兩排色塊：站上的品牌色，一排暗一排亮 */
const SWATCHES = ['lavender', 'brand', 'magenta', 'sky', 'amber', 'green', 'ink', 'zinc'];

interface Props {
  total: number;
  iot: number;
}

export default function SetupNeofetch({ total, iot }: Props) {
  const { t } = useTranslation();
  return (
    <header className="setup-term">
      <div className="setup-term-bar">
        <span className="setup-term-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h1 className="setup-term-title">
          {t('setup.heroTitle')}
          <span className="setup-term-title-sub">koimsurai@home-server: ~</span>
        </h1>
      </div>
      <div className="setup-term-body">
        <p className="setup-term-comment"># {t('setup.subtitle')}</p>
        <p className="setup-term-cmd">
          <span className="setup-term-prompt">$</span> neofetch
        </p>
        <div className="setup-term-fetch">
          <svg
            className="setup-term-logo"
            viewBox={`0 0 ${LOGO[0].length * PX} ${LOGO.length * PX}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="setup-term-logo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--lavender-soft)" />
                <stop offset="0.45" stopColor="var(--brand)" />
                <stop offset="1" stopColor="var(--magenta)" />
              </linearGradient>
            </defs>
            <g fill="url(#setup-term-logo-grad)">
              {PIXELS.map((p) => (
                <rect key={p.id} x={p.x * PX + 0.5} y={p.y * PX + 0.5} width={PX - 1} height={PX - 1} rx={1.5} />
              ))}
            </g>
          </svg>
          <div className="setup-term-info">
            <p className="setup-term-host">
              <span className="setup-term-accent">koimsurai</span>@
              <span className="setup-term-accent">home-server</span>
            </p>
            <p className="setup-term-rule" aria-hidden="true">
              ─────────────────────
            </p>
            <dl className="setup-term-specs">
              {SPECS.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              <div>
                <dt>Packages</dt>
                <dd>{t('setup.packages', { count: total, iot })}</dd>
              </div>
            </dl>
            <div className="setup-term-swatches" aria-hidden="true">
              {SWATCHES.map((s) => (
                <i key={s} data-c={s} />
              ))}
            </div>
          </div>
        </div>
        <p className="setup-term-cmd">
          <span className="setup-term-prompt">$</span>
          <span className="setup-term-cursor" aria-hidden="true" />
        </p>
      </div>
    </header>
  );
}
