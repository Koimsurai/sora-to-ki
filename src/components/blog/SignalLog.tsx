// 收到的訊號：留言照無線電的瀑布圖排，最新的在最上面，回覆照時間接在它回的那則底下。
// 左邊是時間軸（UTC，日期換了才寫），中間是 X 頻段的頻寬，每個人落在自己的頻率上（名字決定），右邊是內容。
// 留言頁與文章頁共用；窄的時候（容器查詢）頻寬疊到內容上面。
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommentRow } from '@koimsurai/api-types';
import { bandPath, freqOf } from '@/components/about/messagesWave';
import { groupComments } from '@/lib/comments';
import { utcStamp as stampOf } from '@/lib/serverDate';
import './SignalLog.css';

/** 一列的頻寬與高（SVG viewBox；畫面上橫向拉滿那一欄） */
const BAND_W = 600;
const BAND_H = 36;
/** 頻寬的刻度：深空網路收 X 頻段的那一段 */
const BAND_TICKS = [8400, 8410, 8420, 8430, 8440, 8450];

interface Props {
  comments: CommentRow[];
  liked: number[];
  onLike: (id: number) => void;
  onReply: (c: CommentRow) => void;
}

export default function SignalLog({ comments, liked, onLike, onReply }: Props) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const { roots, repliesOf } = groupComments(comments);
    return [...roots].reverse().flatMap((c) => [c, ...(repliesOf.get(c.id) ?? [])]);
  }, [comments]);

  return (
    <div className="sl">
      <div className="sl-scale" aria-hidden="true">
        <span>UTC</span>
        <span className="sl-ticks">
          {BAND_TICKS.map((f, i) => (
            <i key={f}>
              {f}
              {i === BAND_TICKS.length - 1 && <em> MHz</em>}
            </i>
          ))}
        </span>
      </div>
      <ol className="sl-list">
        {rows.map((c, i) => {
          const isReply = c.parent_id != null;
          const stamp = stampOf(c.created_at);
          const showDate = i === 0 || stampOf(rows[i - 1].created_at).date !== stamp.date;
          return (
            <li key={c.id} className={isReply ? 'sl-item is-reply' : 'sl-item'}>
              <time className="sl-stamp" dateTime={c.created_at}>
                {showDate && <b>{stamp.date}</b>}
                <span>{stamp.time}</span>
              </time>
              <svg
                className="sl-band"
                viewBox={`0 0 ${BAND_W} ${BAND_H}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line className="sl-floor" x1={0} y1={BAND_H / 2} x2={BAND_W} y2={BAND_H / 2} />
                <path d={bandPath(c.content, freqOf(c.author), BAND_W, BAND_H, isReply ? 0.4 : 0.6)} />
              </svg>
              <div className="sl-body">
                <div className="sl-head">
                  {c.website ? (
                    <a className="sl-author" href={c.website} target="_blank" rel="noopener noreferrer nofollow ugc">
                      {c.author}
                    </a>
                  ) : (
                    <span className="sl-author">{c.author}</span>
                  )}
                  {c.is_admin ? <span className="sl-admin">{t('signal.admin')}</span> : null}
                </div>
                <p className="sl-text">{c.content}</p>
                <div className="sl-actions">
                  {!isReply && (
                    <button type="button" onClick={() => onReply(c)}>
                      {t('signal.reply')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={liked.includes(c.id) ? 'is-liked' : undefined}
                    aria-pressed={liked.includes(c.id)}
                    onClick={() => onLike(c.id)}
                  >
                    {t('signal.like')}
                    {c.likes > 0 && <span>{c.likes}</span>}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
