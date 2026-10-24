// 文章底下的回應：跟留言頁同一套訊號語言（blog/SignalLog 的瀑布圖、blog/CommentForm 的送出列），
// 沒有頻道與天線（那是留言頁自己的門面），送出列放在原地、不黏在視窗底部。
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { commentsQueryOptions } from '@/data/commentsData';
import { useCommentLikes } from '@/hooks/useCommentLikes';
import CommentForm, { type ReplyTarget } from './CommentForm';
import SignalLog from './SignalLog';
import './ArticleComments.css';

const BASE = 'posts';

export default function ArticleComments({ postId, allowComments = true }: { postId: number; allowComments?: boolean }) {
  const { t } = useTranslation();
  const { data: comments = [], isPending } = useQuery(commentsQueryOptions(BASE, postId));
  const { liked, like } = useCommentLikes(BASE, postId);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  return (
    <section className="ac" aria-labelledby="ac-title">
      <header className="ac-head">
        <h2 id="ac-title">{t('signal.heading')}</h2>
        <span>{t('signal.rxCount', { count: comments.length })}</span>
      </header>
      {isPending ? null : comments.length ? (
        <SignalLog
          comments={comments}
          liked={liked}
          onLike={(id) => void like(id)}
          onReply={(c) => {
            if (!allowComments) return;
            setReplyTo({ id: c.id, author: c.author });
            textRef.current?.focus();
          }}
        />
      ) : (
        <p className="ac-empty">{t('signal.empty')}</p>
      )}
      {allowComments ? (
        <CommentForm
          base={BASE}
          postId={postId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          textRef={textRef}
        />
      ) : (
        <p className="ac-closed">{t('signal.closed')}</p>
      )}
    </section>
  );
}
