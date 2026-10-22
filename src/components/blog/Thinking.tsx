import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { enterStyle } from '@/lib/enter';
import { Rss } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { jsonAuthHeaders } from '@/lib/authToken';
import ThoughtCard from './ThoughtCard';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { apiUrl } from '@/lib/api';
import { useThoughtAdmin } from '@/hooks/useThoughtAdmin';
import { parseServerDate } from '@/lib/serverDate';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import MomentsSky from './MomentsSky';
import './Thinking.css';

const dayOf = (iso: string) => {
  const d = parseServerDate(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
const yearOf = (iso: string) => String(parseServerDate(iso).getFullYear());

/* 碎念 / 思考 feed（接 /api/thoughts）— 路由未公開。
   admin 可在頂端發文（content + 選填連結 → 後端 unfurl）。 */

/** 離開：淡掉（下一頁的天空接手） */
const LEAVE = {
  keyframes: [{ opacity: 1 }, { opacity: 0 }],
  options: { duration: 500, easing: 'ease-out' },
};
const stillOnMoments = () => stripLocalePrefix(window.location.pathname) === 'thinking';

interface Prefill {
  kind?: string;
  title?: string;
}

function Thinking() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  // 碎念列表改由 TanStack Query 管理：route loader 已 prefetch → SSR baked、
  // hydrate 後 useQuery 讀快取。發文／編輯／刪除用 useMutation，成功後 invalidate 重抓。
  const { data: thoughts } = useQuery(thoughtsListQueryOptions);
  const [draft, setDraft] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [prefill, setPrefill] = useState<Prefill | null>(null); // 從 /watch 一鍵發帶來的 media

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('thinking_prefill');
      // sessionStorage 在 server 上不存在 → 只能在 effect 讀（同 Comments 的說明）
      if (raw) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setPrefill(JSON.parse(raw) as Prefill);
        sessionStorage.removeItem('thinking_prefill');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshThoughts = () => queryClient.invalidateQueries({ queryKey: thoughtsListQueryOptions.queryKey });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(apiUrl('/api/admin/thoughts'), {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          content: draft.trim(),
          refUrl: draftUrl.trim() || undefined,
          ref: prefill ? { type: 'media', json: prefill } : undefined,
        }),
      });
      if (!r.ok) throw new Error(`POST /admin/thoughts ${r.status}`);
    },
    onSuccess: () => {
      setDraft('');
      setDraftUrl('');
      setPrefill(null);
      void refreshThoughts();
    },
  });
  const posting = createMutation.isPending;

  // 刪除／編輯跟單則頁共用（hooks/useThoughtAdmin）
  const admin = useThoughtAdmin();

  const submit = () => {
    if (!draft.trim() || posting) return;
    createMutation.mutate();
  };
  const del = (id: number) => {
    if (!window.confirm('刪除這則碎念？')) return;
    admin.remove.mutate(id);
  };
  const edit = (id: number, content: string) => admin.edit.mutate({ id, content });

  // 從首頁飛過來：鏡頭快抵達才出現
  const pageRef = useRef<HTMLDivElement | null>(null);
  useSkyPage(pageRef, { sky: 'moments', ready: true, arriveAt: 1600, leave: LEAVE, stillHere: stillOnMoments });

  // 每一則捲到才「閃」一下再定住，不是一進頁面全部同時閃完
  const count = thoughts?.length ?? 0;
  useEffect(() => {
    const page = pageRef.current;
    if (!page || !count) return;
    // 飛過來的話，等土星停好、碎成像素之後才開始閃（--arrive-delay 見 useSkyPage）
    const wait = page.classList.contains('is-arriving')
      ? Number.parseFloat(page.style.getPropertyValue('--arrive-delay')) || 0
      : 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-lit');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -18% 0px' },
    );
    const start = window.setTimeout(() => {
      page.querySelectorAll('.tk-feed-item:not(.is-lit)').forEach((el) => io.observe(el));
    }, wait);
    return () => {
      window.clearTimeout(start);
      io.disconnect();
    };
  }, [count]);

  return (
    // 不壓暗背景：停在頁首的土星與像素星空就是這一頁的畫面，蓋一層暗幕的話土星一到就變暗一截
    <div className="tk-page" ref={pageRef}>
      {/* 頁首：右邊一大片點陣天空（星雲與琥珀色的土星），滑鼠劃過會激起火花 */}
      <section className="tk-hero">
        <MomentsSky />
        <header className="tk-header enter" style={enterStyle({ y: 16, dur: 500 })}>
          <div className="tk-title-row">
            <h1 className="tk-title">
              {t('thinking.title')}
              <span className="tk-title-en">Moments</span>
            </h1>
            <a className="tk-rss" href="/api/thoughts/rss" target="_blank" rel="noopener noreferrer" aria-label="RSS">
              <Rss size={18} />
            </a>
          </div>
          <p className="tk-subtitle">{t('thinking.subtitle')}</p>
        </header>
      </section>

      <div className="tk-wrap">
        {isAdmin && (
          <div className="tk-compose">
            <textarea
              className="tk-compose-text"
              placeholder="想到什麼，寫一句…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
            />
            <input
              className="tk-compose-url"
              type="text"
              placeholder="貼個連結（選填，自動抓預覽）"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
            />
            {prefill && (
              <div className="tk-compose-chip">
                <span>
                  🎬 {prefill.kind} · {prefill.title}
                </span>
                <button onClick={() => setPrefill(null)} aria-label="移除附加">
                  ✕
                </button>
              </div>
            )}
            <div className="tk-compose-row">
              <button
                className="tk-compose-send"
                onClick={() => {
                  void submit();
                }}
                disabled={posting || !draft.trim()}
              >
                {posting ? '發送中…' : '發送'}
              </button>
            </div>
          </div>
        )}

        {thoughts?.length === 0 && <p className="tk-empty">{t('thinking.empty')}</p>}

        {/* 一則一則像念頭閃過：左邊日期、中間一條虛線上的像素點，右邊大字。
            捲到時閃一下再定住（.is-lit，見 Thinking.css） */}
        {!!thoughts?.length && (
          <ul className="tk-feed">
            {thoughts.map((th) => (
              <li className="tk-feed-item" key={th.id}>
                <div className="tk-log-date">
                  <span>{dayOf(th.created_at)}</span>
                  <span>{yearOf(th.created_at)}</span>
                </div>
                <div className="tk-log-gutter" aria-hidden="true">
                  <span />
                </div>
                <ThoughtCard
                  th={th}
                  isAdmin={isAdmin}
                  onDelete={(id) => {
                    void del(id);
                  }}
                  onEdit={(id, content) => {
                    void edit(id, content);
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {!!thoughts?.length && (
          <p className="tk-ending enter" style={enterStyle({ y: 16, dur: 500 })}>
            {t('thinking.ending')}
          </p>
        )}
      </div>
    </div>
  );
}

export default Thinking;
