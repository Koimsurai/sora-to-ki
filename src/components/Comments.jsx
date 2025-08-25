import React, { useState, useEffect } from 'react';
import './Comments.css';

function Comments({ postId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [author, setAuthor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchComments();
  }, [postId]);

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

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ author, content: newComment }),
      });

      if (response.ok) {
        setNewComment('');
        setAuthor('');
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

  return (
    <div className="comments-section">
      <h3 className="comments-title">留言</h3>
      <div className="comment-list">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="comment-item">
              <p className="comment-author">{comment.author}</p>
              <p className="comment-content">{comment.content}</p>
              <p className="comment-date">{new Date(comment.created_at).toLocaleString()}</p>
            </div>
          ))
        ) : (
          <p>還沒有留言。</p>
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
          {error && <p className="error-message">{error}</p>}
          <button type="submit" disabled={isLoading} className="submit-comment-button">
            {isLoading ? '提交中...' : '提交留言'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Comments;
