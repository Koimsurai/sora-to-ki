import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Comments.css';

function Comments({ postId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [author, setAuthor] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [likedComments, setLikedComments] = useState([]);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState({ num1: 0, num2: 0 });
  const [replyTo, setReplyTo] = useState(null);

  useEffect(() => {
    fetchComments();
    const liked = JSON.parse(localStorage.getItem('liked_comments_' + postId) || '[]');
    setLikedComments(liked);
    generateCaptcha();
    // Restore saved author info
    const savedAuthor = localStorage.getItem('comment_author');
    const savedEmail = localStorage.getItem('comment_email');
    const savedWebsite = localStorage.getItem('comment_website');
    if (savedAuthor) setAuthor(savedAuthor);
    if (savedEmail) setEmail(savedEmail);
    if (savedWebsite) setWebsite(savedWebsite);
  }, [postId]);

  const generateCaptcha = () => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    setCaptchaQuestion({ num1, num2 });
  };

  const fetchComments = async () => {
    try {
      const response = await fetch('/api/posts/' + postId + '/comments');
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !author.trim()) {
      setError('暱稱和留言內容不能為空');
      return;
    }

    const expectedAnswer = captchaQuestion.num1 + captchaQuestion.num2;
    if (parseInt(captchaAnswer) !== expectedAnswer) {
      setError('驗證碼錯誤，請重新計算');
      generateCaptcha();
      setCaptchaAnswer('');
      return;
    }

    setIsLoading(true);
    setError('');

    // Save author info for next time
    localStorage.setItem('comment_author', author);
    localStorage.setItem('comment_email', email);
    localStorage.setItem('comment_website', website);

    try {
      const response = await fetch('/api/posts/' + postId + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author,
          content: replyTo ? '@' + replyTo + ' ' + newComment : newComment,
          captcha: parseInt(captchaAnswer),
          captchaAnswer: expectedAnswer,
        }),
      });

      if (response.ok) {
        setNewComment('');
        setCaptchaAnswer('');
        setReplyTo(null);
        generateCaptcha();
        fetchComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || '留言失敗');
      }
    } catch (error) {
      setError('留言失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async (commentId) => {
    if (likedComments.includes(commentId)) return;

    try {
      const response = await fetch('/api/comments/' + commentId + '/like', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setComments(comments.map(comment =>
          comment.id === commentId ? { ...comment, likes: data.likes } : comment
        ));
        const newLiked = [...likedComments, commentId];
        setLikedComments(newLiked);
        localStorage.setItem('liked_comments_' + postId, JSON.stringify(newLiked));
      }
    } catch (error) {
      console.error('Error liking comment:', error);
    }
  };

  const getAvatarColor = (name) => {
    const colors = ['#7f5af0', '#2cb67d', '#e53170', '#ff8906', '#3da9fc', '#ef4444', '#8b5cf6', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return mins + ' 分鐘前';
    if (hrs < 24) return hrs + ' 小時前';
    if (days < 7) return days + ' 天前';
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="comments-">
      {/* ── Comment Form (-style: form first) ── */}
      <div className="comment-form-card">
        <div className="form-avatar">
          <div className="avatar-circle" style={{ background: author ? getAvatarColor(author) : 'rgba(127,90,240,0.3)' }}>
            {author ? author.charAt(0).toUpperCase() : '?'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="comment-form">
          <div className="form-fields">
            <div className="field-group">
              <input
                type="text"
                placeholder="暱稱 *"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                required
                className="field-input"
              />
            </div>
            <div className="field-group">
              <input
                type="email"
                placeholder="郵箱（選填，用於通知）"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input"
              />
            </div>
            <div className="field-group">
              <input
                type="url"
                placeholder="網站（選填）"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="field-input"
              />
            </div>
          </div>

          <div className="textarea-wrap">
            {replyTo && (
              <div className="reply-indicator">
                <span>回覆 @{replyTo}</span>
                <button type="button" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <textarea
              placeholder="留下你的想法..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              required
              rows="4"
              className="comment-textarea"
            />
          </div>

          <div className="form-actions">
            <div className="captcha-area">
              <span className="captcha-q">{captchaQuestion.num1} + {captchaQuestion.num2} = </span>
              <input
                type="number"
                placeholder="?"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                required
                className="captcha-input"
              />
            </div>
            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? (
                <span className="spinner" />
              ) : '發送'}
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                className="form-error"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* ── Comments List ── */}
      <div className="comments-list">
        <div className="comments-header">
          <h3>{comments.length > 0 ? comments.length + ' 條留言' : '還沒有留言'}</h3>
        </div>

        <AnimatePresence>
          {comments.length > 0 ? (
            comments.map((comment, idx) => (
              <motion.div
                key={comment.id}
                className="comment-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <div className="comment-left">
                  <div className="comment-avatar" style={{ background: getAvatarColor(comment.author) }}>
                    {comment.author.charAt(0).toUpperCase()}
                  </div>
                  {idx < comments.length - 1 && <div className="comment-line" />}
                </div>

                <div className="comment-body">
                  <div className="comment-meta">
                    <span className="comment-author">{comment.author}</span>
                    <span className="comment-time">{formatDate(comment.created_at)}</span>
                  </div>
                  <p className="comment-text">{comment.content}</p>
                  <div className="comment-actions">
                    <button
                      className={'action-btn like ' + (likedComments.includes(comment.id) ? 'liked' : '')}
                      onClick={() => handleLike(comment.id)}
                      disabled={likedComments.includes(comment.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={likedComments.includes(comment.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span>{comment.likes || 0}</span>
                    </button>
                    <button className="action-btn reply" onClick={() => { setReplyTo(comment.author); document.querySelector('.comment-textarea')?.focus(); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      <span>回覆</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div
              className="no-comments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p>✨ 成為第一個留言的人吧</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Comments;
