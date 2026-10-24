// 一則碎念：列表頁那顆彗星往這一則放大進去看（blog/useCometSky、blog/cometZoom）。
// 像用望遠鏡把彗尾的這一段拉近：塵埃變成看得清的顆粒，這一段亮著、上下其他的退暗；
// 留言是這一段彗尾上的碎屑，照時間往下排，越晚留的越遠；這一段的末端是送出列（blog/CommentForm）。
// 從列表點進來時是同一個鏡頭繼續放大，不用再飛；直接打開時照這一則在列表上大概的位置算一段。
import { useEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CommentRow } from '@koimsurai/api-types';
import { useAuth } from '@/contexts/auth';
import { commentsQueryOptions } from '@/data/commentsData';
import { thoughtDetailQueryOptions } from '@/data/thoughtData';
import { useCommentLikes } from '@/hooks/useCommentLikes';
import { useLocaleNavigate } from '@/hooks/useLocale';
import { useThoughtAdmin } from '@/hooks/useThoughtAdmin';
import { LocaleLink } from '@/i18n/locale-link';
import { groupComments } from '@/lib/comments';
import { utcStamp } from '@/lib/serverDate';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import type { Pt } from '@/store/pageTransition';
import { estimateZoom, layoutSegment, zoomArc, type ZoomSpec } from './comet';
import { clearCometZoom, COMET_ZOOM, peekCometZoom } from './cometZoom';
import CommentForm, { type ReplyTarget } from './CommentForm';
import MomentPost from './MomentPost';
import { useCometSky } from './useCometSky';
import './Moments.css';

const BASE = 'thoughts';
/** 彗核在返回連結下面多遠 */
const HEAD_GAP = 90;

/** 彗尾上的一粒碎屑：一則留言 */
function Bit({
  c,
  liked,
  onLike,
  onReply,
}: {
  c: CommentRow;
  liked: boolean;
  onLike: () => void;
  onReply: (() => void) | null;
}) {
  const { t } = useTranslation();
  const stamp = utcStamp(c.created_at);
  return (
    <>
      <div className="mo-post-head">
        {c.website ? (
          <a className="mo-bit-author" href={c.website} target="_blank" rel="noopener noreferrer nofollow ugc">
            {c.author}
          </a>
        ) : (
          <b>{c.author}</b>
        )}
        {c.is_admin ? <span className="mo-bit-admin">{t('signal.admin')}</span> : null}
        <time className="mo-time" dateTime={c.created_at}>
          {stamp.date} {stamp.time} UTC
        </time>
      </div>
      <p className="mo-text mo-bit-text">{c.content}</p>
      <div className="mo-bit-act">
        {onReply && (
          <button type="button" onClick={onReply}>
            {t('signal.reply')}
          </button>
        )}
        <button type="button" className={liked ? 'is-on' : undefined} aria-pressed={liked} onClick={onLike}>
          {t('signal.like')}
          {c.likes > 0 && <span>{c.likes}</span>}
        </button>
      </div>
    </>
  );
}

export default function ThinkingDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams({ strict: false }); // 兩種路由（/thinking/$id、/$locale/thinking/$id）共用
  const { isAdmin } = useAuth();
  const navigate = useLocaleNavigate();
  const admin = useThoughtAdmin();
  // 碎念改由 useQuery 讀：route loader 已 ensureQueryData 預取 → SSR baked、hydrate 讀快取。
  // data：undefined=載入中、null=找不到、Thought=有。
  const { data: thought } = useQuery(thoughtDetailQueryOptions(id));
  const { data: comments = [] } = useQuery(commentsQueryOptions(BASE, id));
  const { liked, like } = useCommentLikes(BASE, id);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // 照時間往下排，回覆接在它回的那則後面
  const { roots, repliesOf } = groupComments(comments);
  const bits = roots.flatMap((c) => [c, ...(repliesOf.get(c.id) ?? [])]);

  const pageRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const postsRef = useRef<(HTMLLIElement | null)[]>([]);
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ghostsRef = useRef<(HTMLLIElement | null)[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const count = thought ? 1 + bits.length : 0;

  // 從列表放大進來的：拿列表留下的鏡頭；直接打開的：照這一則在列表上大概的位置算一個
  const [handoff] = useState(() => peekCometZoom(id));
  useEffect(() => clearCometZoom(), []);
  const { data: list = [] } = useQuery(thoughtsListQueryOptions);
  const listIndex = Math.max(
    0,
    list.findIndex((th) => String(th.id) === id),
  );
  const layout = (width: number, top: number, heights: number[], o: Pt) => {
    // 列表放大完，這一則停在畫面上的 T：換成這一頁的版面座標（不能壓到返回連結）
    const spec: ZoomSpec = handoff
      ? { ...handoff, T: { x: handoff.T.x - o.x, y: Math.max(top, handoff.T.y - o.y) } }
      : estimateZoom(width, listIndex, top, COMET_ZOOM);
    return layoutSegment(zoomArc(spec), spec.span * spec.zoom, spec.narrow, spec.T.y, heights);
  };
  const hover = useCometSky({ pageRef, headRef, canvasRef, postsRef, dotsRef, ghostsRef, endRef }, count, 0, {
    headGap: HEAD_GAP,
    layout,
    zoom: COMET_ZOOM,
    focus: true,
    handedOver: handoff !== null,
  });

  const del = (tid: number) => {
    if (!window.confirm('刪除這則碎念？')) return;
    admin.remove.mutate(tid, { onSuccess: () => void navigate('/thinking') });
  };
  const edit = (tid: number, content: string) => {
    const next = window.prompt('編輯這則碎念', content);
    if (next?.trim() && next !== content) admin.edit.mutate({ id: tid, content: next.trim() });
  };

  return (
    <div className="mo mo--detail" ref={pageRef}>
      <canvas className="mo-comet" ref={canvasRef} aria-hidden="true" />

      <header className="mo-head" ref={headRef}>
        <LocaleLink to="/thinking" className="mo-back">
          ← {t('thinking.title')}
        </LocaleLink>
        {thought === null && <p>{t('thinking.notFound')}</p>}
      </header>

      {thought && (
        <>
          <div className="mo-dots" aria-hidden="true">
            {[thought.id, ...bits.map((c) => `c${c.id}`)].map((key, i) => (
              <span
                key={key}
                className={i === 0 ? 'mo-dot is-new' : 'mo-dot is-bit'}
                ref={(el) => {
                  dotsRef.current[i] = el;
                }}
              />
            ))}
          </div>

          <ol className="mo-list">
            <li
              className="mo-post is-core"
              ref={(el) => {
                postsRef.current[0] = el;
              }}
            >
              <MomentPost th={thought} detail />
              {isAdmin && (
                <div className="mo-bit-act">
                  <button type="button" onClick={() => edit(thought.id, thought.content)}>
                    編輯
                  </button>
                  <button type="button" onClick={() => del(thought.id)}>
                    刪除
                  </button>
                </div>
              )}
            </li>
            {bits.map((c, k) => (
              <li
                key={c.id}
                className={c.parent_id != null ? 'mo-post mo-bit is-reply' : 'mo-post mo-bit'}
                ref={(el) => {
                  postsRef.current[k + 1] = el;
                }}
                onPointerEnter={() => hover(k + 1, true)}
                onPointerLeave={() => hover(k + 1, false)}
              >
                <Bit
                  c={c}
                  liked={liked.includes(c.id)}
                  onLike={() => void like(c.id)}
                  onReply={
                    c.parent_id == null
                      ? () => {
                          setReplyTo({ id: c.id, author: c.author });
                          textRef.current?.focus();
                        }
                      : null
                  }
                />
              </li>
            ))}
          </ol>

          <div className="mo-end mo-tx" ref={endRef}>
            <CommentForm
              base={BASE}
              postId={id}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              textRef={textRef}
              prompt="shell"
            />
          </div>
        </>
      )}
    </div>
  );
}
