import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThoughtRef } from '@koimsurai/api-types';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { adminBooksQueryOptions, adminCollectionQueryOptions, adminStatsQueryOptions } from '@/data/adminData';
import { useSiteConfig } from '@/data/siteConfig';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { apiUrl } from '@/lib/api';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import {
  THOUGHT_VERBS,
  defaultVerb,
  isThoughtVerb,
  thoughtCard,
  thoughtLine,
  type MediaKind,
  type ThoughtCard,
  type ThoughtVerb,
} from '@/lib/thoughtRef';
import type { Thought } from '@/types/thought';
import AdminLoading from './AdminLoading';
import { AdminSelect } from './AdminFields';
import { PageHead, SectionHead } from './AdminPage';
import { formatWhen } from './adminFormat';
import { candidates, type Candidate } from './thoughtCandidates';
import './ThoughtsManager.css';

// 碎念（2026-10 後台提案的「寫」）：左邊寫，右邊是同步進來的看、讀、聽。
// 那些紀錄不會自己發，按「寫」才帶進左邊；附了作品的話字可以空著，只發「看了」也行。
// 前台的樣子在 blog/MomentPost，卡片怎麼畫兩邊共用 lib/thoughtRef。

/** 右邊清單的篩選：附上那一排的「看了／讀了／聽了」 */
type Shelf = 'watch' | 'book' | 'track';
const SHELVES: { key: Shelf; verb: ThoughtVerb }[] = [
  { key: 'watch', verb: 'watched' },
  { key: 'book', verb: 'read' },
  { key: 'track', verb: 'listened' },
];
const shelfOf = (kind: MediaKind): Shelf => (kind === 'book' ? 'book' : kind === 'track' ? 'track' : 'watch');

/** 撰寫框附了什麼：沒有、原本那則的（編輯時）、一筆紀錄、一個網址 */
type Attach =
  | { type: 'none' }
  | { type: 'keep'; card: ThoughtCard }
  | { type: 'record'; c: Candidate }
  | { type: 'link'; url: string };

/** 動詞：跟著附的東西走、指定一個、或不用動詞 */
type VerbChoice = 'auto' | 'none' | ThoughtVerb;

const EMPTY_REF: ThoughtRef = {
  title: null,
  desc: null,
  image: null,
  site: null,
  kind: null,
  url: null,
  source: null,
  overview: null,
  genres: null,
  poster: null,
  mediaType: null,
  rating: null,
  year: null,
  tmdbId: null,
  creator: null,
  progress: null,
  key: null,
};

/** 一筆紀錄先畫成前台的卡片（TMDb 的簡介、評分是送出後後端才補上的） */
const recordCard = (c: Candidate): ThoughtCard | null =>
  thoughtCard({ ref: { ...EMPTY_REF, ...c.ref.json }, ref_type: 'media', ref_url: c.ref.url ?? null });

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body === undefined ? authHeaders() : jsonAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(apiErrorText(await res.json().catch(() => ({})), at, 'errors', `${res.status}`));
  }
}

export default function ThoughtsManager() {
  const { t } = useAdminT();
  const verbLabel = (v: ThoughtVerb) => t(`thoughts.verb.${v}`);
  const queryClient = useQueryClient();
  const { author } = useSiteConfig();
  const list = useQuery(thoughtsListQueryOptions);
  const stats = useQuery(adminStatsQueryOptions);
  const collection = useQuery(adminCollectionQueryOptions);
  const books = useQuery(adminBooksQueryOptions);

  const [content, setContent] = useState('');
  const [attach, setAttach] = useState<Attach>({ type: 'none' });
  const [verbChoice, setVerbChoice] = useState<VerbChoice>('auto');
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [editing, setEditing] = useState<Thought | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Thought | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // 預覽裡新的那則的日期（render 裡不能直接 new Date()）
  const [today] = useState(() => new Date());

  const thoughts = useMemo(() => list.data ?? [], [list.data]);
  // 候選的小字（種類、來源）是當下語言的字，所以每次 render 重算（不 memo），換語言才跟得上
  const records = candidates(collection.data?.watch ?? [], collection.data?.tracks ?? [], books.data ?? []);
  const written = useMemo(() => new Set(thoughts.map((th) => th.ref?.key).filter(Boolean)), [thoughts]);
  const shown = shelf ? records.filter((c) => shelfOf(c.kind) === shelf) : records;

  // 附的東西決定預設動詞；「自動」時跟著它走
  const verb: ThoughtVerb | null =
    verbChoice === 'none'
      ? null
      : verbChoice !== 'auto'
        ? verbChoice
        : attach.type === 'record'
          ? defaultVerb(attach.c.kind)
          : attach.type === 'link'
            ? 'shared'
            : attach.type === 'keep' && attach.card.type === 'media'
              ? defaultVerb(attach.card.kind ?? 'film')
              : attach.type === 'keep'
                ? 'shared'
                : null;

  const card: ThoughtCard | null =
    attach.type === 'keep'
      ? attach.card
      : attach.type === 'record'
        ? recordCard(attach.c)
        : attach.type === 'link' && attach.url.trim()
          ? {
              type: 'link',
              kind: null,
              title: attach.url.trim().replace(/^https?:\/\//, ''),
              href: undefined,
              poster: undefined,
              facts: [t('thoughts.fetchOnSend')],
            }
          : null;

  const canSend = !busy && (content.trim() !== '' || card !== null);

  const reset = () => {
    setContent('');
    setAttach({ type: 'none' });
    setVerbChoice('auto');
    setEditing(null);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['thoughts'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { content: content.trim() };
      if (editing) {
        // 編輯：動詞給空字串是拿掉；附件只有換過才送
        body.verb = verb ?? '';
        if (attach.type === 'none' && editing.ref_type) body.clearRef = true;
        if (attach.type === 'record') body.ref = attach.c.ref;
        if (attach.type === 'link' && attach.url.trim() !== editing.ref_url) body.refUrl = attach.url.trim();
        await send('PUT', `/api/admin/thoughts/${editing.id}`, body);
        toast.success(t('thoughts.toast.updated'));
      } else {
        if (verb) body.verb = verb;
        if (attach.type === 'record') body.ref = attach.c.ref;
        if (attach.type === 'link') body.refUrl = attach.url.trim();
        await send('POST', '/api/admin/thoughts', body);
        toast.success(t('thoughts.toast.sent'));
      }
      reset();
      refresh();
    } catch (e) {
      toast.error(t('thoughts.toast.sendFailed', { error: e instanceof Error ? e.message : '' }));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (th: Thought) => {
    const existing = thoughtCard(th);
    setEditing(th);
    setContent(th.content);
    setAttach(
      th.ref_type === 'link' && th.ref_url
        ? { type: 'link', url: th.ref_url }
        : existing
          ? { type: 'keep', card: existing }
          : { type: 'none' },
    );
    setVerbChoice(isThoughtVerb(th.verb) ? th.verb : 'none');
    textRef.current?.focus();
  };

  const pick = (c: Candidate) => {
    setAttach({ type: 'record', c });
    textRef.current?.focus();
  };

  const remove = async () => {
    const th = deleteTarget;
    setDeleteTarget(null);
    if (!th) return;
    try {
      await send('DELETE', `/api/admin/thoughts/${th.id}`);
      toast.success(t('thoughts.toast.deleted'));
      if (editing?.id === th.id) reset();
      refresh();
    } catch (e) {
      toast.error(t('thoughts.toast.deleteFailed', { error: e instanceof Error ? e.message : '' }));
    }
  };

  const s = stats.data;
  const meta =
    s?.thoughts !== undefined ? t('thoughts.meta', { count: s.thoughts, month: s.thoughtsThisMonth ?? 0 }) : undefined;
  const linkOn = attach.type === 'link';

  return (
    <div className="adm-page">
      <PageHead title={t('nav.thoughts')} latin="Moments" meta={meta} />

      <div className="adm-split">
        <div className="adm-split-main adm-th-main">
          <form
            className="adm-th-compose"
            aria-label={editing ? t('thoughts.composeEdit') : t('thoughts.composeNew')}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="adm-th-text">
              <span className="adm-prompt-mark" aria-hidden="true">
                &gt;
              </span>
              <span className="sr-only">{t('thoughts.content')}</span>
              <textarea
                ref={textRef}
                rows={3}
                value={content}
                placeholder={t('thoughts.placeholder')}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            </label>

            {linkOn && (
              <label className="adm-prompt adm-prompt-compact adm-th-url">
                <span className="adm-prompt-mark" aria-hidden="true">
                  ↗
                </span>
                <span className="sr-only">{t('thoughts.link')}</span>
                <input
                  type="url"
                  value={attach.url}
                  placeholder="https://"
                  onChange={(e) => setAttach({ type: 'link', url: e.target.value })}
                />
              </label>
            )}

            {card && !linkOn && (
              <div className="adm-th-attached">
                <AttachedCard card={card} />
                <button
                  type="button"
                  className="adm-icon-btn"
                  aria-label={t('thoughts.removeAttach')}
                  onClick={() => setAttach({ type: 'none' })}
                >
                  ×
                </button>
              </div>
            )}

            <div className="adm-th-bar">
              <span className="adm-caps">{t('thoughts.attach')}</span>
              <button
                type="button"
                className="adm-th-chip"
                aria-pressed={linkOn}
                onClick={() => setAttach(linkOn ? { type: 'none' } : { type: 'link', url: '' })}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t('thoughts.link')}
              </button>
              {SHELVES.map((sh) => (
                <button
                  key={sh.key}
                  type="button"
                  className="adm-th-chip"
                  aria-pressed={shelf === sh.key}
                  aria-controls="adm-th-records"
                  onClick={() => setShelf(shelf === sh.key ? null : sh.key)}
                >
                  <span className="adm-tab-dot" aria-hidden="true" />
                  {verbLabel(sh.verb)}
                </button>
              ))}
              <span className="adm-grow" />
              <div className="adm-prompt adm-prompt-compact adm-th-verb">
                <span className="adm-meta" aria-hidden="true">
                  {t('thoughts.verbLabel')}
                </span>
                <AdminSelect
                  label={t('thoughts.verbLabel')}
                  value={verbChoice}
                  onChange={(v) => setVerbChoice(v as VerbChoice)}
                  options={[
                    {
                      value: 'auto',
                      label:
                        verb && verbChoice === 'auto'
                          ? t('thoughts.verbAutoWith', { verb: verbLabel(verb) })
                          : t('thoughts.verbAuto'),
                    },
                    ...THOUGHT_VERBS.map((v) => ({ value: v, label: verbLabel(v) })),
                    { value: 'none', label: t('thoughts.verbNone') },
                  ]}
                />
              </div>
              {editing && (
                <button type="button" className="adm-btn" onClick={reset}>
                  {t('thoughts.cancel')}
                </button>
              )}
              <button type="submit" className="adm-btn adm-btn-primary" disabled={!canSend}>
                {busy ? t('thoughts.sending') : editing ? t('thoughts.update') : t('thoughts.send')}
                <kbd className="adm-meta" aria-hidden="true">
                  ⌘↵
                </kbd>
              </button>
            </div>
          </form>

          <section aria-labelledby="th-preview-h">
            <SectionHead id="th-preview-h">{t('thoughts.previewHead')}</SectionHead>
            <div className="adm-th-preview">
              <span className="adm-th-preview-head">
                <span>{author}</span>
                {verb && <span className="adm-th-verb-text">{verbLabel(verb)}</span>}
                <span className="adm-meta">{formatWhen(editing?.created_at ?? today, 'MM.dd')}</span>
              </span>
              {content.trim() ? (
                <p className="adm-th-preview-text">{content.trim()}</p>
              ) : !card ? (
                <p className="adm-th-preview-text adm-th-placeholder">{t('thoughts.previewEmpty')}</p>
              ) : null}
              {card && <AttachedCard card={card} compact />}
              <span className="adm-meta">
                {t('thoughts.previewStats', { likes: editing?.likes ?? 0, comments: editing?.comment_count ?? 0 })}
              </span>
            </div>
          </section>

          <section aria-labelledby="th-list-h">
            <SectionHead id="th-list-h">{t('thoughts.listHead')}</SectionHead>
            {list.isPending ? (
              <AdminLoading label={t('thoughts.loadingThoughts')} />
            ) : thoughts.length === 0 ? (
              <p className="adm-empty">{t('thoughts.empty')}</p>
            ) : (
              <ul className="adm-th-list">
                {thoughts.map((th) => {
                  const c = thoughtCard(th);
                  const text = th.content.trim().split('\n')[0];
                  const line = [c?.title, text].filter(Boolean).join(' · ') || thoughtLine(th);
                  return (
                    <li key={th.id} className="adm-row" data-editing={editing?.id === th.id || undefined}>
                      <span className="adm-th-row-verb">
                        {isThoughtVerb(th.verb) ? verbLabel(th.verb) : t('thoughts.said')}
                      </span>
                      <span className="adm-row-main">
                        <span className="adm-row-title">{line}</span>
                        <span className="adm-meta">
                          {[
                            formatWhen(th.created_at, 'MM.dd'),
                            `♡ ${th.likes}`,
                            th.comment_count ? t('thoughts.rowComments', { count: th.comment_count }) : null,
                            th.edited ? t('thoughts.edited') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="adm-row-actions">
                        <a
                          className="adm-icon-btn"
                          href={`/thinking/${th.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('thoughts.viewOnSite', { title: line })}
                        >
                          ↗
                        </a>
                        <button
                          type="button"
                          className="adm-icon-btn"
                          aria-label={t('thoughts.editRow', { title: line })}
                          onClick={() => startEdit(th)}
                        >
                          {t('thoughts.editShort')}
                        </button>
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          aria-label={t('thoughts.deleteRow', { title: line })}
                          onClick={() => setDeleteTarget(th)}
                        >
                          {t('thoughts.deleteShort')}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="adm-split-side" aria-labelledby="th-records-h">
          <SectionHead id="th-records-h">{t('thoughts.recordsHead')}</SectionHead>
          <p className="adm-form-note">{t('thoughts.recordsNote')}</p>
          {collection.isPending || books.isPending ? (
            <AdminLoading label={t('thoughts.loadingRecords')} />
          ) : shown.length === 0 ? (
            <p className="adm-empty">{shelf ? t('thoughts.shelfEmpty') : t('thoughts.recordsEmpty')}</p>
          ) : (
            <ul id="adm-th-records" className="adm-th-records">
              {shown.map((c) => {
                const done = written.has(c.key);
                const picked = attach.type === 'record' && attach.c.key === c.key;
                return (
                  <li key={c.key} className="adm-row" data-done={done || undefined}>
                    {c.cover ? (
                      <img
                        className="adm-th-thumb"
                        data-square={c.kind === 'track' || undefined}
                        src={c.cover}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="adm-th-thumb adm-cover-empty"
                        data-square={c.kind === 'track' || undefined}
                        aria-hidden="true"
                      />
                    )}
                    <span className="adm-row-main">
                      <span className="adm-row-title">{c.title}</span>
                      <span className="adm-meta">
                        {[...c.facts, formatWhen(c.when, 'MM.dd')].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="adm-btn adm-btn-small"
                      aria-pressed={picked}
                      aria-label={t('thoughts.writeRow', { title: c.title })}
                      onClick={() => pick(c)}
                    >
                      {picked ? t('thoughts.picked') : done ? t('thoughts.done') : t('thoughts.write')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('thoughts.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('thoughts.confirmBody', { title: deleteTarget ? thoughtLine(deleteTarget) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('thoughts.keep')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void remove();
              }}
            >
              {t('thoughts.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 附上的東西：海報、種類與小字、名字。compact 是預覽裡那張（小一號） */
function AttachedCard({ card, compact = false }: { card: ThoughtCard; compact?: boolean }) {
  const { t } = useAdminT();
  const meta = [
    card.kind ? t(`thoughts.kind.${card.kind}`) : card.type === 'link' ? t('thoughts.link') : null,
    ...card.facts,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="adm-th-card" data-compact={compact || undefined}>
      {card.type === 'media' &&
        (card.poster ? (
          <img
            className="adm-th-poster"
            data-square={card.kind === 'track' || undefined}
            src={card.poster}
            alt=""
            loading="lazy"
          />
        ) : (
          <span
            className="adm-th-poster adm-cover-empty"
            data-square={card.kind === 'track' || undefined}
            aria-hidden="true"
          />
        ))}
      <span className="adm-th-card-text">
        {meta && <span className="adm-caps">{meta}</span>}
        <span className="adm-th-card-title">{card.title || t('thoughts.untitled')}</span>
      </span>
    </div>
  );
}
