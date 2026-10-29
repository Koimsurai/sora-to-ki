// 一則碎念（彗尾上的一則）：作者、日期、內容、附帶的連結或作品、喜歡與留言數。
// 列表頁（blog/Thinking）與單則頁（blog/ThinkingDetail）共用；單則頁是彗核那一則，不必再連回自己。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { useSiteConfig } from '@/data/siteConfig';
import { useThoughtReaction } from '@/hooks/useThoughtReaction';
import { LocaleLink } from '@/i18n/locale-link';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { isThoughtVerb, thoughtCard } from '@/lib/thoughtRef';
import type { Thought } from '@/types/thought';

/** 附的連結或作品：左邊一條點線；作品多一張小海報（歌是方的） */
function Embed({ th }: { th: Thought }) {
  const { t } = useTranslation();
  const card = thoughtCard(th);
  if (!card) return null;
  const meta = [card.kind ? t(`thinking.kind.${card.kind}`) : null, ...card.facts].filter(Boolean).join(' · ');
  const body = (
    <>
      {card.poster && (
        <img
          className="mo-embed-poster"
          data-square={card.kind === 'track' || undefined}
          src={card.poster}
          alt=""
          loading="lazy"
          decoding="async"
          width={36}
          height={card.kind === 'track' ? 36 : 54}
        />
      )}
      <span className="mo-embed-text">
        <b>{card.title}</b>
        {meta && <span>{meta}</span>}
      </span>
    </>
  );
  return card.href ? (
    <a className="mo-embed" href={card.href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="mo-embed">{body}</div>
  );
}

export default function MomentPost({ th, detail = false }: { th: Thought; detail?: boolean }) {
  const { t } = useTranslation();
  const { author } = useSiteConfig();
  const { likes, reacted, react } = useThoughtReaction(th);
  const date = parseServerDate(th.created_at);
  const [thisYear] = useState(() => new Date().getFullYear());
  // 日期取決於時區，server 與 client 可能差一天
  const time = (
    <time dateTime={th.created_at} suppressHydrationWarning>
      {dotDate(date, !detail && date.getFullYear() === thisYear)}
    </time>
  );
  return (
    <>
      <div className="mo-post-head">
        <b>{author}</b>
        {isThoughtVerb(th.verb) && <span className="mo-verb">{t(`thinking.verb.${th.verb}`)}</span>}
        {detail ? (
          <span className="mo-time">{time}</span>
        ) : (
          <LocaleLink to={`/thinking/${th.id}`} className="mo-time">
            {time}
          </LocaleLink>
        )}
      </div>
      {/* 只附了作品、沒寫字的那種不留一段空白 */}
      {th.content && <p className="mo-text">{th.content}</p>}
      <Embed th={th} />
      <div className="mo-act">
        <button
          type="button"
          className={reacted === 'like' ? 'is-on' : undefined}
          aria-pressed={reacted === 'like'}
          aria-label={t('thinking.like')}
          onClick={() => {
            void react('like');
          }}
        >
          <Heart aria-hidden="true" />
          {likes}
        </button>
        {detail ? (
          <span aria-label={t('thinking.comments', { count: th.comment_count })}>
            <MessageCircle aria-hidden="true" />
            {th.comment_count}
          </span>
        ) : (
          <LocaleLink to={`/thinking/${th.id}`} aria-label={t('thinking.comments', { count: th.comment_count })}>
            <MessageCircle aria-hidden="true" />
            {th.comment_count}
          </LocaleLink>
        )}
      </div>
    </>
  );
}
