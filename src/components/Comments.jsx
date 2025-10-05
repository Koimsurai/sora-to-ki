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
    const liked = JSON.parse(localStorage.getItem(`liked_comments_${postId}`) || '[]');
    setLikedComments(liked);
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
      } else {
        setError('無法載入留言');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setError('無法載入留言');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !author.trim()) {
      setError('作者和留言內容不能為空');
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
        fetchComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || '留言失敗');
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
      setError('留言失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async (commentId) => {
    if (likedComments.includes(commentId)) {
      return;
    }

    try {
      const response = await fetch(`/api/comments/${commentId}/like`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setComments(comments.map(comment => 
          comment.id === commentId 
            ? { ...comment, likes: data.likes }
            : comment
        ));
        
        const newLiked = [...likedComments, commentId];
        setLikedComments(newLiked);
        localStorage.setItem(`liked_comments_${postId}`, JSON.stringify(newLiked));
      } else {
        alert('按讚失敗');
      }
    } catch (error) {
      console.error('Error liking comment:', error);
      alert('按讚失敗');
    }
  };

  return (
    <div className="comments-section-v2">
      <h3 className="comments-title-v2">留言</h3>
      <div className="comment-list-v2">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="comment-item-v2">
                <div className="comment-avatar-v2">{comment.author.charAt(0)}</div>
                <div className="comment-content-v2">
                    <div className="comment-header-v2">
                        <p className="comment-author-v2">{comment.author}</p>
                        <p className="comment-date-v2">{new Date(comment.created_at).toLocaleString('zh-TW')}</p>
                    </div>
                    <p className="comment-text-v2">{comment.content}</p>
                    <div className="comment-actions-v2">
                        <button
                        className={`like-button-v2 ${likedComments.includes(comment.id) ? 'liked' : ''}`}
                        onClick={() => handleLike(comment.id)}
                        disabled={likedComments.includes(comment.id)}
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        </svg>
                        <span>{comment.likes || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
          ))
        ) : (
          <div className="no-comments-v2">
            <p>還沒有留言，成為第一個留言的人吧！</p>
          </div>
        )}
      </div>
      <div className="comment-form-container-v2">
        <h4 className="comment-form-title-v2">留下你的留言</h4>
        <form onSubmit={handleSubmit} className="comment-form-v2">
          <div className="form-row-v2">
            <input
              type="text"
              placeholder="你的名字"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              required
              className="comment-input-v2"
            />
          </div>
          <textarea
            placeholder="你的留言"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            required
            rows="4"
            className="comment-textarea-v2"
          ></textarea>
          <div className="form-row-v2">
            <div className="captcha-group-v2">
              <label className="captcha-label-v2">{captchaQuestion.num1} + {captchaQuestion.num2} = ?</label>
              <input
                type="number"
                placeholder="驗證碼"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                required
                className="captcha-input-v2"
              />
            </div>
            <button type="submit" disabled={isLoading} className="submit-comment-button-v2">
              {isLoading ? <span className="spinner-v2"></span> : '提交'}
            </button>
          </div>
          {error && <p className="error-message-v2">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default Comments;
