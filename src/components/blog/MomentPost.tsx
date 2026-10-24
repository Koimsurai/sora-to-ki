// 一則碎念（彗尾上的一則）：作者、日期、內容、附帶的連結或作品、喜歡與留言數。
// 列表頁（blog/Thinking）與單則頁（blog/ThinkingDetail）共用；單則頁是彗核那一則，不必再連回自己。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { useThoughtReaction } from '@/hooks/useThoughtReaction';
import { LocaleLink } from '@/i18n/locale-link';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import type { Thought } from '@/types/thought';

const MOMENT_AUTHOR = 'Koimsurai';

function Embed({ th }: { th: Thought }) {
  const ref = th.ref;
  if (!ref || (th.ref_type !== 'link' && th.ref_type !== 'media')) return null;
  const href = (th.ref_type === 'media' ? ref.url : null) ?? th.ref_url ?? undefined;
  // 沒抓到標題就寫網址本身（去掉協定），站名寫在下面一行
  const title = ref.title ?? th.ref_url?.replace(/^https?:\/\//, '') ?? '';
  const meta =
    th.ref_type === 'media'
      ? [ref.kind, ref.year, ref.source].filter((v) => v !== null && v !== '').join(' · ')
      : (ref.site ?? '');
  return (
    <a className="mo-embed" href={href} target="_blank" rel="noopener noreferrer">
      <b>{title}</b>
      {meta && <span>{meta}</span>}
    </a>
  );
}

export default function MomentPost({ th, detail = false }: { th: Thought; detail?: boolean }) {
  const { t } = useTranslation();
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
        <b>{MOMENT_AUTHOR}</b>
        {detail ? (
          <span className="mo-time">{time}</span>
        ) : (
          <LocaleLink to={`/thinking/${th.id}`} className="mo-time">
            {time}
          </LocaleLink>
        )}
      </div>
      <p className="mo-text">{th.content}</p>
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
