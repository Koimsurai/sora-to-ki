import React, { useState, useEffect } from 'react';
import './Comments.css';

function Comments({ postId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [author, setAuthor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [likedComments, setLikedComments] = useState([]);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState({ num1: 0, num2: 0 });

  useEffect(() => {
    fetchComments();
    // Load liked comments from localStorage
    const liked = JSON.parse(localStorage.getItem(`liked_comments_${postId}`) || '[]');
    setLikedComments(liked);
    // Generate captcha
    generateCaptcha();
  }, [postId]);

  const generateCaptcha = () => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    setCaptchaQuestion({ num1, num2 });
  };

  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
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
      setError('作者和留言內容不能為空');
      return;
    }

    // Validate captcha
    const expectedAnswer = captchaQuestion.num1 + captchaQuestion.num2;
    if (parseInt(captchaAnswer) !== expectedAnswer) {
      setError('驗證碼錯誤，請重新計算');
      generateCaptcha();
      setCaptchaAnswer('');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          author, 
          content: newComment,
          captcha: parseInt(captchaAnswer),
          captchaAnswer: expectedAnswer
        }),
      });

      if (response.ok) {
        setNewComment('');
        setAuthor('');
        setCaptchaAnswer('');
        generateCaptcha();
        fetchComments(); // Re-fetch comments to display the new one
      } else {
        const errorData = await response.json();
        setError(errorData.message || '留言失敗');
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
      setError('留言失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async (commentId) => {
    // Check if already liked
    if (likedComments.includes(commentId)) {
      return;
    }

    try {
      const response = await fetch(`/api/comments/${commentId}/like`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        // Update comment likes in state
        setComments(comments.map(comment => 
          comment.id === commentId 
            ? { ...comment, likes: data.likes }
            : comment
        ));
        
        // Save to localStorage
        const newLiked = [...likedComments, commentId];
        setLikedComments(newLiked);
        localStorage.setItem(`liked_comments_${postId}`, JSON.stringify(newLiked));
      }
    } catch (error) {
      console.error('Error liking comment:', error);
    }
  };

  return (
    <div className="comments-section">
      <h3 className="comments-title">留言</h3>
      <div className="comment-list">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div className="comment-header">
                <p className="comment-author">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {comment.author}
                </p>
                <p className="comment-date">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {new Date(comment.created_at).toLocaleString('zh-TW')}
                </p>
              </div>
              <p className="comment-content">{comment.content}</p>
              <div className="comment-actions">
                <button
                  className={`like-button ${likedComments.includes(comment.id) ? 'liked' : ''}`}
                  onClick={() => handleLike(comment.id)}
                  disabled={likedComments.includes(comment.id)}
                  title={likedComments.includes(comment.id) ? '已按讚' : '按讚'}
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span className="like-count">{comment.likes || 0}</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-comments">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>還沒有留言，成為第一個留言的人吧！</p>
          </div>
        )}
      </div>
      <div className="comment-form-container">
        <h4 className="comment-form-title">留下你的留言</h4>
        <form onSubmit={handleSubmit} className="comment-form">
          <div className="form-group">
            <input
              type="text"
              placeholder="你的名字"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              className="comment-input"
            />
          </div>
          <div className="form-group">
            <textarea
              placeholder="你的留言"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              required
              rows="4"
              className="comment-textarea"
            ></textarea>
          </div>
          <div className="form-group captcha-group">
            <label className="captcha-label">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              驗證碼：{captchaQuestion.num1} + {captchaQuestion.num2} = ?
            </label>
            <input
              type="number"
              placeholder="請輸入答案"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              required
              className="captcha-input"
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={isLoading} className="submit-comment-button">
            {isLoading ? (
              <>
                <span className="spinner"></span>
                提交中...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
                提交留言
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Comments;
