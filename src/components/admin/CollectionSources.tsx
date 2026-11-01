import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SourceInfo, SourcesResponse, SourceUpdate } from '@koimsurai/api-types';

import { Switch } from '@/components/ui/switch';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
import { formatWhen } from './adminFormat';
import { SiteField } from './site/SiteFields';
import './site/SiteSettings.css';
import './CollectionSources.css';

// 收藏的來源（收藏 → 來源）：每個平台一列，狀態、同步開關、展開填金鑰。
// 金鑰只寫不讀（後端 handlers/sources.rs）：填過的只知道「填了」，一般欄位多給末四碼。

type Group = 'watch' | 'read' | 'listen' | 'play';
type State = 'ok' | 'bad' | 'off';

/** 每個來源放在哪一組、哪個地區的人在用；名字與說明在語系檔（collection.sources.src.<key>） */
const META: Record<string, { group: Group; region?: 'tw' | 'cnjp' | 'kr' | 'global' }> = {
  tmdb: { group: 'watch' },
  simkl: { group: 'watch', region: 'global' },
  bahamut: { group: 'watch', region: 'tw' },
  bangumi: { group: 'watch', region: 'cnjp' },
  anilist: { group: 'watch', region: 'global' },
  mal: { group: 'watch', region: 'global' },
  letterboxd: { group: 'watch', region: 'global' },
  googleBooks: { group: 'read', region: 'global' },
  ncl: { group: 'read', region: 'tw' },
  nlk: { group: 'read', region: 'kr' },
  neodb: { group: 'read', region: 'global' },
  spotify: { group: 'listen', region: 'global' },
  lastfm: { group: 'listen', region: 'global' },
  listenbrainz: { group: 'listen', region: 'global' },
  steam: { group: 'play', region: 'global' },
  wakatime: { group: 'play', region: 'global' },
};

const GROUPS: Group[] = ['watch', 'read', 'listen', 'play'];

const sourcesQuery = {
  queryKey: ['admin', 'sources'],
  queryFn: async (): Promise<SourcesResponse> => {
    const res = await fetch('/api/admin/sources', { headers: jsonAuthHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as SourcesResponse;
  },
};

async function send(method: string, path: string, body?: SourceUpdate): Promise<SourceInfo> {
  const res = await fetch(path, {
    method,
    headers: jsonAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as SourceInfo;
  if (!res.ok) throw new Error(apiErrorText(data, at, 'errors', `${res.status}`));
  return data;
}

/** 狀態記號與右邊那行字 */
function describe(s: SourceInfo, t: (k: string, o?: Record<string, unknown>) => string): [State, string] {
  if (!s.configured) return ['off', t('collection.sources.status.off')];
  if (s.sync === false) return ['off', t('collection.sources.status.syncOff')];
  const optionalOnly = s.fields.length > 0 && s.fields.every((f) => f.optional) && s.fields.every((f) => !f.from);
  if (s.last) {
    const when = formatWhen(s.last.at);
    return s.last.ok
      ? ['ok', t('collection.sources.status.synced', { when, count: s.last.count ?? 0 })]
      : ['bad', t('collection.sources.status.failed', { when, error: s.last.error ?? '' })];
  }
  if (s.sync === true) return ['ok', t('collection.sources.status.never')];
  if (s.check && !s.check.ok)
    return ['bad', t('collection.sources.status.checkFailed', { error: s.check.error ?? '' })];
  if (optionalOnly) return ['off', t(`collection.sources.src.${s.key}.unset`)];
  if (s.check?.count != null) return ['ok', t('collection.sources.status.connectedCount', { count: s.check.count })];
  return ['ok', t('collection.sources.status.connected')];
}

const MARK: Record<State, string> = { ok: '●', bad: '×', off: '○' };

export default function CollectionSources() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery(sourcesQuery);
  const [open, setOpen] = useState<string | null>(null);
  /** 正在填、還沒存的值：key 是 `<來源>:<環境變數名>` */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (isPending) return <AdminLoading label={t('collection.sources.loading')} />;
  if (isError) return <p className="adm-empty">{t('collection.sources.loadFailed')}</p>;

  const name = (key: string) => t(`collection.sources.src.${key}.name`);
  const replace = (next: SourceInfo) =>
    queryClient.setQueryData<SourcesResponse>(sourcesQuery.queryKey, (old) =>
      old ? { ...old, sources: old.sources.map((s) => (s.key === next.key ? next : s)) } : old,
    );

  /** 同一時間只做一件事；失敗跳提示 */
  const run = async (key: string, work: () => Promise<SourceInfo>, done: (s: SourceInfo) => string) => {
    setBusy(key);
    try {
      const next = await work();
      replace(next);
      toast.success(done(next));
      // 收藏頁的資料可能跟著變了（新的同步、換了金鑰）
      void queryClient.invalidateQueries({ queryKey: ['admin', 'collection'] });
    } catch (e) {
      toast.error(t('collection.sources.failed', { error: e instanceof Error ? e.message : '' }));
    } finally {
      setBusy(null);
    }
  };

  const save = (s: SourceInfo) => {
    const values: Record<string, string> = {};
    for (const f of s.fields) {
      const v = draft[`${s.key}:${f.env}`]?.trim();
      if (v) values[f.env] = v;
    }
    return run(
      s.key,
      () => send('PUT', `/api/admin/sources/${s.key}`, { values }),
      () => {
        setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith(`${s.key}:`))));
        return t('collection.sources.saved', { name: name(s.key) });
      },
    );
  };

  const clear = (s: SourceInfo) => {
    const values = Object.fromEntries(s.fields.filter((f) => f.from === 'admin').map((f) => [f.env, null]));
    return run(
      s.key,
      () => send('PUT', `/api/admin/sources/${s.key}`, { values }),
      () => t('collection.sources.cleared', { name: name(s.key) }),
    );
  };

  const toggleSync = (s: SourceInfo, on: boolean) =>
    run(
      s.key,
      () => send('PUT', `/api/admin/sources/${s.key}`, { sync: on }),
      () => t(on ? 'collection.sources.syncTurnedOn' : 'collection.sources.syncTurnedOff', { name: name(s.key) }),
    );

  const syncNow = (s: SourceInfo) =>
    run(
      s.key,
      () => send('POST', `/api/admin/sources/${s.key}/sync`),
      (next) =>
        next.last?.ok === false
          ? t('collection.sources.syncFailed', { name: name(s.key), error: next.last.error ?? '' })
          : t('collection.sources.syncDone', { name: name(s.key), count: next.last?.count ?? 0 }),
    );

  const placeholder = (f: SourceInfo['fields'][number]) => {
    if (f.from === 'env') return t('collection.sources.placeholder.env');
    if (f.from === 'admin') {
      return f.hint
        ? t('collection.sources.placeholder.adminHint', { hint: f.hint })
        : t('collection.sources.placeholder.admin');
    }
    return '';
  };

  return (
    <div className="cs sfs">
      <p className="adm-form-note">{t('collection.sources.intro')}</p>
      {GROUPS.map((g) => {
        const list = data.sources.filter((s) => META[s.key]?.group === g);
        if (list.length === 0) return null;
        return (
          <section key={g} className="cs-group" aria-labelledby={`cs-${g}`}>
            <h3 id={`cs-${g}`} className="cs-group-h">
              {t(`collection.sources.group.${g}`)}
            </h3>
            <ul className="adm-list">
              {list.map((s) => {
                const [state, status] = describe(s, t);
                const region = META[s.key]?.region;
                const isOpen = open === s.key;
                const hasDraft = s.fields.some((f) => draft[`${s.key}:${f.env}`]?.trim());
                return (
                  <li key={s.key} className="cs-src" data-state={state}>
                    <div className="cs-head">
                      <span className="cs-mark" aria-hidden="true">
                        {MARK[state]}
                      </span>
                      <div className="cs-main">
                        <span className="cs-name">
                          {name(s.key)}
                          {region && <span className="cs-region">{t(`collection.sources.region.${region}`)}</span>}
                        </span>
                        <span className="cs-what">{t(`collection.sources.src.${s.key}.what`)}</span>
                      </div>
                      <span className="cs-status">{status}</span>
                      {s.sync != null && (
                        <label className="cs-sync">
                          <Switch
                            checked={s.sync}
                            disabled={busy === s.key || (!s.configured && !s.sync)}
                            onCheckedChange={(on) => void toggleSync(s, on)}
                          />
                          <span className="cs-sync-label">{t('collection.sources.sync')}</span>
                        </label>
                      )}
                      <button
                        type="button"
                        className="adm-btn adm-btn-small"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : s.key)}
                      >
                        {isOpen ? t('collection.sources.collapse') : t('collection.sources.settings')}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="cs-body">
                        <p className="cs-help">{t(`collection.sources.src.${s.key}.help`)}</p>
                        {s.key === 'spotify' && (
                          <p className="cs-redirect">
                            <span className="sf-label">{t('collection.sources.redirect')}</span>
                            <code>{data.spotify_redirect}</code>
                          </p>
                        )}
                        {s.fields.length > 0 && (
                          <div className="cs-fields">
                            {s.fields.map((f) => (
                              <SiteField
                                key={f.env}
                                label={t(`collection.sources.field.${f.env}`)}
                                hint={f.optional ? t('collection.sources.optional') : undefined}
                              >
                                <input
                                  className="sf-input"
                                  type={f.secret ? 'password' : 'text'}
                                  value={draft[`${s.key}:${f.env}`] ?? ''}
                                  placeholder={placeholder(f)}
                                  autoComplete="off"
                                  spellCheck={false}
                                  onChange={(e) => setDraft((d) => ({ ...d, [`${s.key}:${f.env}`]: e.target.value }))}
                                />
                              </SiteField>
                            ))}
                          </div>
                        )}
                        <div className="cs-actions">
                          {s.fields.length > 0 && (
                            <button
                              type="button"
                              className="adm-btn adm-btn-primary adm-btn-small"
                              disabled={!hasDraft || busy === s.key}
                              onClick={() => void save(s)}
                            >
                              {t('collection.sources.save')}
                            </button>
                          )}
                          {s.key === 'spotify' && (
                            <a
                              className="adm-btn adm-btn-small"
                              href="/api/spotify/login"
                              target="_blank"
                              rel="noreferrer"
                              aria-disabled={!s.fields.slice(0, 2).every((f) => f.from)}
                            >
                              {t('collection.sources.connectSpotify')}
                            </a>
                          )}
                          {s.sync != null && (
                            <button
                              type="button"
                              className="adm-btn adm-btn-small"
                              disabled={!s.configured || busy === s.key}
                              onClick={() => void syncNow(s)}
                            >
                              {busy === s.key ? t('collection.sources.syncing') : t('collection.sources.syncNow')}
                            </button>
                          )}
                          {s.fields.some((f) => f.from === 'admin') && (
                            <button
                              type="button"
                              className="adm-btn adm-btn-small cs-clear"
                              disabled={busy === s.key}
                              onClick={() => void clear(s)}
                            >
                              {t('collection.sources.clear')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
