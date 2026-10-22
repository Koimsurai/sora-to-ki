import { useState, useEffect, type CSSProperties } from 'react';
import { LocaleLink } from '@/i18n/locale-link';
import { Heart, ThumbsDown, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { parseServerDate } from '@/lib/serverDate';
import { apiUrl } from '@/lib/api';
import Comments from './Comments';
import { Modal, ModalTitle } from '@/components/common/Modal';

/* 單則碎念卡片（feed 與詳情頁共用）。
   - 讚/倒讚：可取消、可切換（localStorage 記 reaction，後端依差值調整）
   - 留言：feed 模式點 icon 跳浮動視窗；detail 模式直接顯示在頁面
   - admin：inline 編輯 + 刪除（ghost 文字鈕） */

const AUTHOR = 'Koimsurai';

/**
 * 念頭閃過：一個字一個字浮現，剛出現時是琥珀色的光、再冷卻成白字（跟首頁碎念窗同一種語言）。
 * 整段在 1.6 秒內出完，長的那則每個字的間隔就短一點，不會讓人等。
 * 什麼時候開始播由外面決定（碎念頁是捲到那一則才播，見 Thinking.css 的 .is-lit）
 */
function FlashText({ text }: { text: string }) {
  const chars = Array.from(text, (ch, pos) => ({ ch, pos }));
  const step = Math.min(45, 1600 / Math.max(1, chars.length));
  return (
    <p className="tk-text tk-text--flash" aria-label={text} style={{ '--step': `${step}ms` } as CSSProperties}>
      {chars.map((c) => (
        <span key={c.pos} aria-hidden="true" style={{ '--i': c.pos } as CSSProperties}>
          {c.ch}
        </span>
      ))}
    </p>
  );
}

// 改吃後端生成的型別（backend handlers::thoughts::ThoughtOut）。手寫版把 likes /
// dislikes / comment_count / edited 都標成可選，實際上後端每次都給；ref 則反過來
// ——手寫版只列了前端有 render 的 key，少了 mediaType / tmdbId。
import type { ThoughtOut } from '@koimsurai/api-types';

export type Thought = ThoughtOut;

interface ThoughtCardProps {
  th: Thought;
  isAdmin?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: (id: number, content: string) => void;
  detail?: boolean;
}

export default function ThoughtCard({ th, isAdmin, onDelete, onEdit, detail = false }: ThoughtCardProps) {
  const timeAgo = useTimeAgo();
  const lang = useTranslation().i18n.resolvedLanguage ?? 'zh-TW';
  // `?? 0` 拿掉了：後端這三個欄位是 i64 不是 Option，每次都有值
  const [likes, setLikes] = useState(th.likes);
  const [dislikes, setDislikes] = useState(th.dislikes);
  const key = 'tk_react_' + th.id;
  // 按過的讚存在 localStorage，只有 client 讀得到：寫在 useState 初始化裡的話 server 繪 ''、
  // client 繪儲存值，hydrate 時 React 不會補正屬性，按過的讚就不亮。所以等掛上之後才讀。
  const [reacted, setReacted] = useState('');
  useEffect(() => {
    try {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setReacted(localStorage.getItem(key) ?? '');
    } catch {
      /* 隱私模式等讀不到的情況：當成沒按過 */
    }
  }, [key]);
  const [showComments, setShowComments] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(th.content);

  const react = async (kind: string) => {
    const next = reacted === kind ? '' : kind; // 同一顆=取消；不同=切換
    try {
      const r = await fetch(apiUrl(`/api/thoughts/${th.id}/react`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prev: reacted, next }),
      });
      const d = (await r.json().catch(() => ({}))) as { likes?: number; dislikes?: number };
      if (typeof d.likes === 'number') setLikes(d.likes);
      if (typeof d.dislikes === 'number') setDislikes(d.dislikes);
      localStorage.setItem(key, next);
      setReacted(next);
    } catch {
      /* ignore */
    }
  };

  const saveEdit = () => {
    if (editText.trim() && onEdit) onEdit(th.id, editText.trim());
    setEditing(false);
  };

  return (
    <div className="tk-card">
      <div className="tk-card-head">
        <span className="tk-author">{AUTHOR}</span>
        {/* 相對時間取決於「現在」，server 與 client 算出來可能差一分鐘 */}
        <time className="tk-time" dateTime={th.created_at} suppressHydrationWarning>
          {timeAgo(th.created_at, { absoluteAfterDays: 30 })}
        </time>
        {th.edited && th.updated_at && (
          <span
            className="tk-edited"
            data-edited={`編輯於 ${parseServerDate(th.updated_at).toLocaleDateString(lang, { dateStyle: 'full' })}`}
          >
            （已編輯）
          </span>
        )}
      </div>

      {editing ? (
        <div className="tk-edit">
          <textarea className="tk-edit-text" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
          <div className="tk-edit-row">
            <button className="tk-edit-save" onClick={saveEdit}>
              儲存
            </button>
            <button className="tk-edit-cancel" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <FlashText text={th.content} />
      )}

      {/* href 的 `?? undefined`：後端的 Option 是 null，React 對 null 與 undefined 都是
          「不要這個屬性」，只是 href 的型別只收 undefined。行為與型別化之前一致。 */}
      {th.ref_type === 'link' && th.ref && (
        <a
          className="tk-embed tk-embed--link tk-linkcard"
          href={th.ref_url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="tk-embed-info">
            <h2 className="tk-embed-title">{th.ref.title ?? th.ref_url}</h2>
            {th.ref.desc && <p className="tk-embed-desc">{th.ref.desc}</p>}
            <span className="tk-embed-meta">
              <span className="tk-embed-site">🌐 {th.ref.site}</span>
            </span>
          </div>
          {th.ref.image && <img className="tk-linkcard-img" src={th.ref.image} alt="" loading="lazy" />}
        </a>
      )}

      {th.ref_type === 'media' && th.ref && (
        <a
          className="tk-embed tk-embed--media tk-media"
          href={th.ref.url ?? th.ref_url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="tk-embed-info">
            <span className="tk-embed-kind">
              {th.ref.kind} · {th.ref.year}
            </span>
            <h2 className="tk-embed-title">{th.ref.title}</h2>
            {th.ref.overview && <p className="tk-embed-desc">{th.ref.overview}</p>}
            <span className="tk-embed-meta">
              ★ {th.ref.rating} · {th.ref.genres} · {th.ref.source}
            </span>
          </div>
          {/* 沒標題就給空 alt：海報只是旁邊那行標題的裝飾，硬掛一個假的替代文字更糟 */}
          {th.ref.poster && (
            <img className="tk-media-poster" src={th.ref.poster} alt={th.ref.title ?? ''} loading="lazy" />
          )}
        </a>
      )}

      <div className="tk-divider" />

      <div className="tk-card-foot">
        <div className="tk-stats">
          <button
            className={'tk-ic' + (reacted === 'like' ? ' is-like' : '')}
            onClick={() => {
              void react('like');
            }}
            aria-label="讚"
          >
            <Heart size={16} /> <span>{likes}</span>
          </button>
          <button
            className={'tk-ic' + (reacted === 'dislike' ? ' is-dislike' : '')}
            onClick={() => {
              void react('dislike');
            }}
            aria-label="倒讚"
          >
            <ThumbsDown size={16} /> <span>{dislikes}</span>
          </button>
          {detail ? (
            <span className="tk-ic tk-ic--static">
              <MessageCircle size={16} /> <span>{th.comment_count}</span>
            </span>
          ) : (
            <button className="tk-ic" onClick={() => setShowComments(true)} aria-label="留言">
              <MessageCircle size={16} /> <span>{th.comment_count}</span>
            </button>
          )}
        </div>
        <div className="tk-foot-actions">
          {isAdmin && (
            <button
              className="tk-act"
              onClick={() => {
                setEditText(th.content);
                setEditing(true);
              }}
            >
              編輯
            </button>
          )}
          {isAdmin && (
            <button className="tk-act tk-act--del" onClick={() => onDelete?.(th.id)}>
              刪除
            </button>
          )}
          {!detail && (
            <LocaleLink className="tk-view" to={`/thinking/${th.id}`}>
              查看 →
            </LocaleLink>
          )}
        </div>
      </div>

      {showComments && (
        <Modal onClose={() => setShowComments(false)} overlayClassName="tk-modal-overlay">
          <div className="tk-modal">
            <div className="tk-modal-head">
              <ModalTitle asChild>
                <span>評論</span>
              </ModalTitle>
              <button type="button" className="tk-modal-close" onClick={() => setShowComments(false)} aria-label="關閉">
                ✕
              </button>
            </div>
            <div className="tk-modal-body">
              <Comments postId={th.id} basePath="thoughts" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
