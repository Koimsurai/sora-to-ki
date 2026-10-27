// 設備：太空梭的貨艙（畫布在 about/setupBay）。四件酬載裝在箱子裡，遠處軌道上是老家那台；
// 琥珀點（讀者）在駕駛艙後窗操作機械手臂，把箱子舉到窗前，圖紙從箱子裡展開。
// 這裡是畫布外面的 DOM：頁首、箱子的標籤、零件表與標題欄、提示，以及給螢幕閱讀器的整份清單。
// 零件表滑過一列，圖紙上那個零件就亮起來（零件編號圖見 scripts/setup-part-maps.ts）。
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { postsListQueryOptions } from '@/data/blogList';
import { useLocale } from '@/hooks/useLocale';
import { usePageTransition } from '@/hooks/usePageTransition';
import { LocaleLink } from '@/i18n/locale-link';
import { postPath } from '@/lib/postPath';
import { sameTitle } from '@/lib/pageTitle';
import { isArriving } from '@/store/pageTransition';
import { createBay, type Bay } from './setupBay';
import { APPLIANCES, GEAR, type GearItem } from './setupGear';
import { BASE, PAYLOADS } from './setupPayloads';
import TelemetryPanel from './TelemetryPanel';
import './Setup.css';

const ITEMS = new Map<string, GearItem>(GEAR.flatMap((c) => c.items.map((it) => [it.id, it] as const)));
const itemOf = (id: string) => ITEMS.get(id);
/** 離場時換頁的點跟著太空梭飛走的初速（px/ms） */
const LEAVE_SPEED = 0.6;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 等換頁的點落地（直接打開這頁就是馬上） */
function landed(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => (isArriving() ? requestAnimationFrame(tick) : resolve());
    tick();
  });
}

export default function Setup() {
  const { t } = useTranslation();
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const tagsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const bayRef = useRef<Bay | null>(null);
  /** 選中哪一件（-1 整架、4 老家那台）、圖紙攤開了沒 */
  const [sel, setSel] = useState(-1);
  const [shown, setShown] = useState(false);
  /** 零件表滑過（或點了）第幾個有編號的零件 */
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const header = headerRef.current;
    const panel = panelRef.current;
    const tags = tagsRef.current.filter((el): el is HTMLButtonElement => el != null);
    if (!root || !canvas || !header || !panel || tags.length !== 5) return;
    const bay = createBay({
      root,
      canvas,
      header,
      panel,
      tags,
      onSelect: (i, isShown) => {
        setSel(i);
        setShown(isShown);
        setHot(null);
      },
    });
    if (!bay) return;
    bayRef.current = bay;
    let alive = true;
    void Promise.all([bay.ready, landed()]).then(() => {
      if (alive) void bay.arrive();
    });
    return () => {
      alive = false;
      bay.destroy();
      bayRef.current = null;
    };
  }, []);

  // 換頁的點落在駕駛艙後窗（琥珀點的家），太空梭再滑進來把窗對上它；離開時點跟著太空梭飛走
  usePageTransition({
    anchor: () => {
      const r = rootRef.current?.getBoundingClientRect();
      const p = bayRef.current?.anchor();
      return r && p ? { x: r.left + p.x, y: r.top + p.y } : null;
    },
    leave: () => {
      const bay = bayRef.current;
      const r = rootRef.current?.getBoundingClientRect();
      if (!bay || !r) return null;
      const at = () => {
        const p = bay.dotNow();
        return { x: r.left + p.x, y: r.top + p.y };
      };
      const point = at();
      const h = bay.heading();
      return { point, velocity: { x: h.x * LEAVE_SPEED, y: h.y * LEAVE_SPEED }, follow: at, done: bay.depart() };
    },
  });

  useEffect(() => {
    bayRef.current?.setHot(hot);
  }, [hot]);

  // 伺服器那張的文章連結：標題跟著語系
  const { data: posts } = useQuery(postsListQueryOptions(locale, 'newest'));
  const postById = useMemo(() => new Map((posts ?? []).map((p) => [p.id, p] as const)), [posts]);
  const postLink = (id: number) => {
    const p = postById.get(id);
    return p ? (
      <LocaleLink key={id} to={postPath(p)} className="su-link">
        {p.title}
      </LocaleLink>
    ) : null;
  };

  const payload = sel >= 0 && sel < 4 ? PAYLOADS[sel] : null;
  /** 零件表的一列：滑過（觸控是點一下、鍵盤是聚焦）就把圖紙上那個零件亮起來 */
  const hotProps = (k: number) => ({
    'aria-pressed': hot === k,
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHot(k),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHot(null),
    onFocus: () => setHot(k),
    onBlur: () => setHot(null),
    onClick: () => setHot(hot === k ? null : k),
  });
  const go = (target: number | 'home') => bayRef.current?.go(target);
  const step = (d: 1 | -1) => bayRef.current?.step(d);

  return (
    <div className="su" ref={rootRef} data-arriving="1">
      <canvas ref={canvasRef} className="su-canvas" aria-hidden="true" />
      <p className="sr-only">{t('setup.bay.canvas')}</p>

      <header className="su-head" ref={headerRef}>
        <h1>{t('setup.heroTitle')}</h1>
        {!sameTitle(t('setup.heroTitle'), 'Setup') && <span className="su-latin">PAYLOAD BAY</span>}
      </header>

      {/* 箱子的標籤：位置由畫布每一幀擺（引線也是畫布畫的） */}
      <div className="su-tags">
        {[...PAYLOADS.map((p) => ({ no: p.no, key: p.key })), { no: BASE.no, key: BASE.key }].map((p, i) => (
          <button
            key={p.key}
            type="button"
            className="su-tag"
            ref={(el) => {
              tagsRef.current[i] = el;
            }}
            onClick={() => go(i)}
            onPointerEnter={() => bayRef.current?.setHover(i)}
            onPointerLeave={() => bayRef.current?.setHover(-1)}
            onFocus={() => bayRef.current?.setHover(i)}
            onBlur={() => bayRef.current?.setHover(-1)}
          >
            <span className="su-tag-no">{pad2(p.no)}</span>
            <span className="su-tag-name">{t(`setup.cat.${p.key}.short`)}</span>
          </button>
        ))}
      </div>

      {/* 零件表＋標題欄：寬版在圖紙右側那欄（位置由畫布給），直版從底部升起 */}
      <aside ref={panelRef} className="su-panel" data-in={shown ? '1' : ''} aria-live="polite">
        {payload && (
          <>
            <div className="su-body">
              {payload.telemetry && <TelemetryPanel />}
              <div className="su-bom-h" aria-hidden="true">
                <span>NO</span>
                <span>PART · SPEC</span>
              </div>
              <ol className="su-bom">
                {payload.parts.map((c, k) => {
                  const it = itemOf(c.id);
                  return it ? (
                    <li key={c.id} style={{ '--i': k } as React.CSSProperties}>
                      <button type="button" className="su-row" {...hotProps(k)}>
                        <span className="su-no">{pad2(k + 1)}</span>
                        <span className="su-name">{it.name}</span>
                        <span className="su-spec">{it.spec}</span>
                      </button>
                    </li>
                  ) : null;
                })}
                {[...(payload.unseen ?? []), ...(payload.others ?? [])].map((id, k) => {
                  const it = itemOf(id);
                  return it ? (
                    <li key={id} style={{ '--i': payload.parts.length + k } as React.CSSProperties}>
                      <div className="su-row is-plain">
                        <span className="su-no">·</span>
                        <span className="su-name">{it.name}</span>
                        <span className="su-spec">
                          {it.spec}
                          {payload.unseen?.includes(id) && ` · ${t('setup.bay.notDrawn')}`}
                        </span>
                      </div>
                    </li>
                  ) : null;
                })}
              </ol>
              {payload.devices && (
                <>
                  <p className="su-sec">{t('setup.bay.devices')}</p>
                  {payload.devices.map((d) => {
                    const it = itemOf(d.id);
                    return it ? (
                      <div key={d.id} className="su-dev">
                        <b>{it.name}</b>
                        {it.roleKey && <span>{t(`setup.roles.${it.roleKey}`)}</span>}
                        {d.posts.length > 0 && <div className="su-links">{d.posts.map(postLink)}</div>}
                      </div>
                    ) : null;
                  })}
                  <div className="su-dev">
                    <b>{t('setup.appliances.title')}</b>
                    <span>
                      {APPLIANCES.map((a) => `${a.name} ${t(`setup.appliances.types.${a.typeKey}`)}`.trim()).join(
                        ' · ',
                      )}
                    </span>
                  </div>
                </>
              )}
              {payload.records && (
                <>
                  <p className="su-sec">{t('setup.bay.records')}</p>
                  <div className="su-links is-stack">{payload.records.map(postLink)}</div>
                </>
              )}
            </div>
            <div className="su-title">
              <span className="su-eyebrow">
                PAYLOAD {pad2(payload.no)} · {payload.en}
              </span>
              <h2>
                {t(`setup.cat.${payload.key}.short`)}
                <small>
                  {t('setup.bay.count', {
                    count: payload.parts.length + (payload.unseen?.length ?? 0) + (payload.others?.length ?? 0),
                  })}
                </small>
              </h2>
              <p className="su-lede">{t(`setup.bay.lede.${payload.key}`)}</p>
              <span className="su-meta">SHEET {sel + 1} / 5 · SCALE NTS</span>
            </div>
          </>
        )}
        {sel === 4 && (
          <>
            <div className="su-body">
              <div className="su-bom-h" aria-hidden="true">
                <span>NO</span>
                <span>POWER-ON SELF TEST</span>
              </div>
              <ol className="su-bom">
                {BASE.specs.map((s, k) => (
                  <li key={s.label} style={{ '--i': k } as React.CSSProperties}>
                    <button type="button" className="su-row is-post" {...hotProps(k)}>
                      <span className="su-no">{pad2(k + 1)}</span>
                      <span className="su-name">{s.label}</span>
                      <span className="su-spec">
                        {s.value} <em>…OK</em>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="su-title">
              <span className="su-eyebrow">BASE II</span>
              <h2>
                {t('setup.cat.base-ii.short')}
                <small>{t('setup.bay.specCount', { count: BASE.specs.length })}</small>
              </h2>
              <p className="su-lede">{t('setup.sheet.memoryText')}</p>
              <span className="su-meta">SHEET 5 / 5 · SCALE NTS</span>
            </div>
          </>
        )}
        {sel >= 0 && (
          <nav className="su-nav">
            <button type="button" onClick={() => step(-1)}>
              ← {t('setup.bay.prev')}
            </button>
            <button type="button" onClick={() => go('home')}>
              {t('setup.bay.home')}
            </button>
            <button type="button" onClick={() => step(1)}>
              {t('setup.bay.next')} →
            </button>
          </nav>
        )}
      </aside>

      <p className="su-hint" data-hide={sel >= 0 ? '1' : undefined} aria-hidden="true">
        <span className="is-wide">{t('setup.bay.hintWide')}</span>
        <span className="is-touch">{t('setup.bay.hintTouch')}</span>
      </p>

      {/* 給螢幕閱讀器與搜尋引擎的版本：全部設備的清單 */}
      <div className="sr-only">
        {GEAR.map((c) => (
          <section key={c.id} aria-label={t(`setup.cat.${c.id}.short`)}>
            <h2>{t(`setup.cat.${c.id}.short`)}</h2>
            <ul>
              {c.items.map((it) => (
                <li key={it.id}>
                  {it.name}，{it.spec}
                  {it.roleKey ? `：${t(`setup.roles.${it.roleKey}`)}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
