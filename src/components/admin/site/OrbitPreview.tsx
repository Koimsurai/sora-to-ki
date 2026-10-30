import { ABOUT_SECTIONS, MAIN_SECTIONS, MORE_SECTIONS } from '@/data/siteSections';
import { useAdminT } from '@/i18n/admin-i18n';
import type { Draft } from './siteDraft';
import './OrbitPreview.css';

/** 畫到哪個階段：精靈的每一步各長出一點，後台的站台設定頁固定用 pages（全部畫出來、關掉的留虛線） */
export type PreviewStage = 'gate' | 'owner' | 'lang' | 'site' | 'pages' | 'done';

// 首頁軌道的示意圖：初次設定精靈的右半邊（跟著填的內容長出來），站台設定頁的頁面開關旁邊。
// 不是真的首頁（那是整個視窗的 3D 背景，縮不進半邊），所以畫得到首頁畫不了的東西：
// 關掉的軌道留一條虛線、滑過哪一列就點亮哪一條。真的首頁在精靈的「完成」那一步才出現（iframe）。
//
// 規則照首頁：主要分區由內到外各一條軌道，關掉一個，外面的往內遞補（starfieldGpu 的 setSections）。
// 軌道壓扁的比例跟首頁一樣（HomeOrbit 的 ORBIT_FLAT）。

const W = 800;
const H = 640;
const CX = W / 2;
const CY = H * 0.44;
const FLAT = 2.5;
const RX0 = 118;
const DRX = 64;
const STAR_R = 30;
/** 衛星停在軌道上的角度（度）：錯開，標註才不會疊在一起 */
const ANGLE: Record<string, number> = { notes: 200, moments: 320, works: 35, collection: 150, about: 255 };

const orbit = (slot: number) => {
  const rx = RX0 + slot * DRX;
  return { rx, ry: rx / FLAT };
};

// 背景的星：固定的亂數種子，每次畫出來都一樣
const STARS = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 150 }, (_, id) => ({
    id,
    x: rand() * 1600,
    y: rand() * 1000,
    r: rand() < 0.08 ? 1.2 : 0.6,
    o: 0.12 + rand() * 0.4,
  }));
})();

interface Props {
  step: PreviewStage;
  draft: Draft;
  /** 滑過或聚焦的那一頁（頁面那一步） */
  hot: string | null;
  owner: { name: string; avatar?: string } | null;
  url: string;
  /** 放在矮的框裡（站台設定頁）：裁掉上下的空白，軌道與標註才不會縮到看不清楚 */
  compact?: boolean;
}

/** compact 時只畫這一段高度（軌道的上緣到站名底下） */
const CROP = { y: 100, h: 440 };

export default function OrbitPreview({ step, draft, hot, owner, url, compact = false }: Props) {
  const { t } = useAdminT();
  const lit = step !== 'gate';
  const all = step === 'done';
  const off = new Set(draft.disabled_pages);
  // 頁面那一步之前，關掉的軌道照常收起來（預設就關著的那幾頁），但不留虛線
  const showGhosts = step === 'pages';
  const named = ['site', 'pages', 'done'].includes(step);

  let slot = 0;
  const rings = MAIN_SECTIONS.map((s) => ({ key: s.key, caps: s.caps, slot: off.has(s.key) ? null : slot++ }));
  const ghosts = showGhosts ? rings.filter((r) => r.slot === null) : [];
  const outer = orbit(Math.max(slot + ghosts.length - 1, 0));
  const nameY = CY + outer.ry + 64;
  const host = url.replace(/^https?:\/\//, '');

  return (
    <div className="wz-sky" aria-hidden="true">
      <svg className="wz-sky-stars" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s) => (
          <circle key={s.id} cx={s.x} cy={s.y} r={s.r} className="wz-star" opacity={s.o} />
        ))}
      </svg>
      <svg
        className="wz-sky-system"
        viewBox={compact ? `0 ${CROP.y} ${W} ${CROP.h}` : `0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {rings.map((r) => {
          if (r.slot === null) return null;
          const { rx, ry } = orbit(r.slot);
          const a = ((ANGLE[r.key] ?? 0) * Math.PI) / 180;
          const x = CX + rx * Math.cos(a);
          const y = CY + ry * Math.sin(a);
          const right = Math.cos(a) >= 0;
          const isHot = hot === r.key;
          return (
            <g
              key={r.key}
              className={`wz-ring${isHot ? ' is-hot' : ''}${lit ? '' : ' is-dark'}${all ? ' is-all' : ''}`}
            >
              <ellipse cx={CX} cy={CY} rx={rx} ry={ry} />
              {lit && (
                <>
                  <circle className="wz-sat" cx={x} cy={y} r={isHot ? 3.2 : 2.6} />
                  <text
                    x={x + (right ? 9 : -9)}
                    y={y + (Math.sin(a) >= 0 ? 14 : -8)}
                    textAnchor={right ? 'start' : 'end'}
                    className="wz-caps"
                  >
                    {r.caps}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {ghosts.map((r, j) => {
          const { rx, ry } = orbit(slot + j);
          const a = ((ANGLE[r.key] ?? 0) * Math.PI) / 180;
          const x = CX + rx * Math.cos(a);
          const y = CY + ry * Math.sin(a);
          return (
            <g key={r.key} className={`wz-ghost${hot === r.key ? ' is-hot' : ''}`}>
              <ellipse cx={CX} cy={CY} rx={rx} ry={ry} />
              <circle cx={x} cy={y} r={2.4} />
              <text x={x + 9} y={y + 15} className="wz-caps">
                {r.caps} · {t('site.sky.off')}
              </text>
            </g>
          );
        })}
        {/* 主星：示意，圓加一圈扁環（實際是哪一顆看主題）。前景那半圈環壓在星球上 */}
        <g className={`wz-planet${lit ? '' : ' is-dark'}${all ? ' is-all' : ''}`}>
          <ellipse cx={CX} cy={CY} rx={STAR_R * 2.1} ry={(STAR_R * 2.1) / 3.6} />
          <circle cx={CX} cy={CY} r={STAR_R} />
          <path
            d={`M ${CX - STAR_R * 2.1} ${CY} A ${STAR_R * 2.1} ${(STAR_R * 2.1) / 3.6} 0 0 0 ${CX + STAR_R * 2.1} ${CY}`}
          />
        </g>
        {owner && (
          <text x={CX} y={nameY + 44} textAnchor="middle" className="wz-caps wz-owner">
            OWNER · {owner.name}
          </text>
        )}
        {named && draft.name.trim() ? (
          <>
            <text x={CX} y={nameY} textAnchor="middle" className="wz-name">
              {draft.name.trim()}
            </text>
            <text x={CX} y={nameY + 22} textAnchor="middle" className="wz-caps">
              {(draft.author.trim() || draft.name.trim()).toUpperCase()}
            </text>
          </>
        ) : (
          <text x={CX} y={nameY} textAnchor="middle" className="wz-caps wz-dim">
            {step === 'gate' ? 'STANDBY' : 'UNNAMED'}
          </text>
        )}
      </svg>

      <p className="wz-sky-cap">
        PREVIEW · <b>{step === 'gate' ? t('site.sky.standby') : t('site.sky.yourHome')}</b>
      </p>
      {step === 'gate' && <p className="wz-sky-note">{t('site.sky.note')}</p>}
      {step === 'lang' && (
        <p className="wz-sky-urls">
          {[draft.default_locale, ...draft.locales.filter((l) => l !== draft.default_locale)].map((l, i) => (
            <span key={l} className={i === 0 ? 'is-default' : ''}>
              {host}/{i === 0 ? '' : `${l.toLowerCase()}/`}
            </span>
          ))}
        </p>
      )}
      {step === 'site' && (
        <div className="wz-sky-card">
          <p className="wz-sky-card-k">{t('site.identity.shareCard')}</p>
          <p className="wz-sky-card-u">{host}</p>
          <p className="wz-sky-card-t">{draft.name.trim() || '—'}</p>
          {draft.description.trim() && <p className="wz-sky-card-d">{draft.description.trim()}</p>}
        </div>
      )}
      {(step === 'pages' || step === 'done') && (
        <div className="wz-sky-menus">
          {[
            { label: t('site.sky.menuAbout'), items: ABOUT_SECTIONS },
            { label: t('site.sky.menuMore'), items: MORE_SECTIONS },
          ].map((m) => (
            <div key={m.label}>
              <p className="wz-sky-menu-h">{m.label} ▾</p>
              {m.items
                .filter((s) => s.toggleable)
                .map((s) => (
                  <p
                    key={s.key}
                    className={`wz-sky-menu-i${off.has(s.key) ? ' is-off' : ''}${hot === s.key ? ' is-hot' : ''}`}
                  >
                    <i />
                    {t(`site.pages.name.${s.key}`)}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
