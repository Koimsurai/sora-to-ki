import { useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import { useQuery } from '@tanstack/react-query';
import type { GithubReposResponse, WorkItem, WorkRepo, WorksContent, WorksResponse } from '@koimsurai/api-types';

import { worksContentQueryOptions } from '@/data/pageContent';
import { useSiteConfig } from '@/data/siteConfig';
import { authHeaders } from '@/lib/authToken';
import { at, useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 作品頁：不讓站長手打 owner/name。先從自己的 GitHub 勾，別人或組織的 repo 再貼網址；
// 每一件旁邊即時看得到它會長成什麼星球的數字。存的時候順便把這些數字記下來（最後量到的），
// 沒設 GITHUB_TOKEN、私有 repo、GitHub 掛了的時候前台照樣畫得出來。

/** 貼進來的東西 → owner/name（網址、git@、結尾的 .git 都吃） */
function repoOf(input: string): string | null {
  const m = /(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** 這幾個 repo 的即時數據（後台專用的預覽端點，用站上的 token） */
async function preview(repos: string[]): Promise<WorkRepo[]> {
  if (repos.length === 0) return [];
  const res = await fetch(`/api/admin/github/works?repos=${encodeURIComponent(repos.join(','))}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  return ((await res.json()) as WorksResponse).works;
}

const snapshotOf = (r: WorkRepo): WorkItem['snapshot'] => ({
  url: r.url,
  created_at: r.created_at,
  pushed_at: r.pushed_at,
  stars: r.stars,
  commits: r.commits,
  languages: r.languages,
});

/** 「TypeScript 58% · ★ 12 · 2.1k commits」 */
function summary(s: WorkItem['snapshot'] | WorkRepo | null | undefined): string {
  if (!s) return at('pageWorks.noNumbers');
  const total = (s.languages ?? []).reduce((n, l) => n + l.bytes, 0);
  const top = s.languages?.[0];
  const lang = top && total ? `${top.name} ${Math.round((top.bytes / total) * 100)}%` : at('pageWorks.noLanguages');
  const commits = (s.commits ?? 0) >= 1000 ? `${((s.commits ?? 0) / 1000).toFixed(1)}k` : String(s.commits ?? 0);
  return `${lang} · ★ ${s.stars ?? 0} · ${commits} commits`;
}

export default function WorksEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = useState<string>(defaultLocale);
  const [paste, setPaste] = useState('');
  const { github } = useSiteConfig();
  const page = usePageDraft(
    worksContentQueryOptions,
    '/api/admin/pages/works',
    (raw) => (raw as WorksContent).items ?? [],
    t('pageWorks.saved'),
    // 存之前把每一件最後量到的數字更新一次；抓不到的那幾件保留原本的
    async (items) => {
      const live = await preview(items.map((w) => w.repo));
      return items.map((w) => {
        const r = live.find((x) => x.repo.toLowerCase() === w.repo.toLowerCase());
        return r ? { ...w, snapshot: snapshotOf(r) } : w;
      });
    },
  );
  const items = page.draft;
  const repos = (items ?? []).map((w) => w.repo);
  const { data: live = [] } = useQuery({
    queryKey: ['admin', 'works-preview', repos.join(',')],
    queryFn: () => preview(repos),
    enabled: repos.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  const { data: mine } = useQuery({
    queryKey: ['admin', 'github-repos', github],
    queryFn: async () => {
      const res = await fetch(`/api/github/repos/${encodeURIComponent(github)}?limit=100`);
      return ((await res.json()) as GithubReposResponse).repos;
    },
    enabled: github !== '',
    staleTime: 10 * 60 * 1000,
  });
  if (page.isPending || !items) return <AdminLoading />;

  const has = (repo: string) => items.some((w) => w.repo.toLowerCase() === repo.toLowerCase());
  const add = (repo: string) => {
    if (has(repo)) return;
    page.set([...items, { repo, name: '', what: {}, snapshot: null }]);
  };
  const pasted = repoOf(paste);

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} />

      <SectionHead id="pg-works-pick">
        {github ? t('pageWorks.pickAs', { account: github }) : t('pageWorks.pick')}
      </SectionHead>
      {github === '' ? (
        <p className="adm-meta">{t('pageWorks.noAccount')}</p>
      ) : (
        <ul className="pg-pick">
          {(mine ?? []).map((r) => {
            const repo = `${github}/${r.name}`;
            const added = has(repo);
            return (
              <li key={r.id}>
                <span className="pg-pick-name">{r.name}</span>
                <span className="adm-meta">
                  {r.language ?? '—'} · ★ {r.stargazers_count}
                </span>
                <button type="button" className="adm-icon-btn" disabled={added} onClick={() => add(repo)}>
                  {added ? t('pageWorks.added') : t('pageWorks.addArrow')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pg-paste">
        <label className="adm-field">
          <span className="adm-caps">{t('pageWorks.paste')}</span>
          <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="github.com/Limatura/tessera" />
        </label>
        <button
          type="button"
          className="adm-btn"
          disabled={!pasted || has(pasted)}
          onClick={() => {
            if (pasted) add(pasted);
            setPaste('');
          }}
        >
          {t('pageWorks.add')}
        </button>
      </div>

      <SectionHead id="pg-works-list">{t('pageWorks.listHead')}</SectionHead>
      {items.length === 0 && <p className="adm-meta">{t('pageWorks.empty')}</p>}
      {items.map((w, i) => {
        const r = live.find((x) => x.repo.toLowerCase() === w.repo.toLowerCase());
        return (
          <div key={w.repo} className="pg-row">
            <div className="pg-work-head pg-wide">
              <span className="pg-work-repo">
                {i === 0 && (
                  <span className="pg-origin" title={t('pageWorks.origin')}>
                    ●
                  </span>
                )}
                {w.repo}
              </span>
              <span className="adm-meta">{summary(r ?? w.snapshot)}</span>
              <div className="pg-work-actions">
                {i > 0 && (
                  <button
                    type="button"
                    className="adm-icon-btn"
                    onClick={() => page.set([w, ...items.filter((_, k) => k !== i)])}
                  >
                    {t('pageWorks.setOrigin')}
                  </button>
                )}
                <RowActions
                  index={i}
                  length={items.length}
                  name={w.repo}
                  onMove={(by) => page.set(move(items, i, by))}
                  onRemove={() => page.set(items.filter((_, k) => k !== i))}
                />
              </div>
            </div>
            <label className="adm-field">
              <span className="adm-caps">{t('pageWorks.name')}</span>
              <input
                value={w.name}
                placeholder={w.repo.split('/')[1]}
                onChange={(e) => page.set(replaceAt(items, i, { name: e.target.value }))}
              />
            </label>
            <div className="adm-field">
              <span className="adm-caps">{t('pageWorks.what')}</span>
              <I18nInput
                lang={lang}
                label={t('pageWorks.what')}
                value={w.what}
                onChange={(what) => page.set(replaceAt(items, i, { what }))}
              />
            </div>
          </div>
        );
      })}

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
