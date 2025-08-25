import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiGrid, FiFileText, FiMessageSquare, FiBarChart2, FiLogOut, FiPlus, FiEdit, FiTrash2, FiSearch, FiFilter, FiChevronLeft, FiChevronRight, FiLoader, FiAlertCircle } from 'react-icons/fi';
import { FaRocket, FaSatelliteDish, FaUserFriends } from 'react-icons/fa';
import './AdminDashboard.css';

function AdminDashboard() {
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ totalPosts: 0, visitors: 0, comments: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, published, draft
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }
    fetchData();
  }, [currentPage, searchTerm, filter, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      // Fetch posts
      const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: searchTerm,
        status: filter === 'all' ? '' : filter
      });
      const postsResponse = await fetch(`/api/admin/posts?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (postsResponse.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }
      const postsData = await postsResponse.json();
      setPosts(postsData.posts);
      setTotalPages(postsData.totalPages);

      // Fetch stats (assuming an endpoint exists)
      // In a real app, you'd fetch this from your backend.
      // Here we'll use dummy data based on posts.
      const statsResponse = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      } else {
        // Fallback dummy data
        setStats({
          totalPosts: postsData.totalPosts || posts.length,
          visitors: 1234, // Dummy data
          comments: 56 // Dummy data
        });
      }

    } catch (error) {
      console.error('獲取數據失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const handleDeletePost = async (postId) => {
    if (!window.confirm('確定要刪除這篇文章嗎？')) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('文章已刪除');
        fetchPosts();
      } else {
        alert('刪除失敗');
      }
    } catch (error) {
      console.error('刪除文章失敗:', error);
      alert('刪除失敗');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-container">
          <div className="cosmic-loader">
            <div className="planet"></div>
            <div className="orbit"></div>
          </div>
          <p className="loading-text">正在載入管理面板...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Left Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <img src="/logo.svg" alt="Logo" className="sidebar-logo" />
          <h2 className="sidebar-title">控制中心</h2>
        </div>
        <nav className="sidebar-nav">
          <Link to="/admin" className="nav-item active">
            <FiGrid className="nav-icon" /> 儀表板
          </Link>
          <Link to="/admin/posts" className="nav-item">
            <FiFileText className="nav-icon" /> 文章管理
          </Link>
          <Link to="/admin/comments" className="nav-item">
            <FiMessageSquare className="nav-icon" /> 留言審核
          </Link>
          <Link to="/admin/stats" className="nav-item">
            <FiBarChart2 className="nav-icon" /> 數據統計
          </Link>
        </nav>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <FiLogOut /> 登出
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main-content">
        <header className="admin-header">
          <h1>儀表板</h1>
          <button onClick={() => navigate('/admin/create')} className="create-post-btn">
            <FiPlus /> 撰寫新文章
          </button>
        </header>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <FaRocket className="stat-card-icon" />
              <h3 className="stat-card-title">總文章數</h3>
            </div>
            <p className="stat-card-value">{stats.totalPosts}</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <FaUserFriends className="stat-card-icon" />
              <h3 className="stat-card-title">訪客統計</h3>
            </div>
            <p className="stat-card-value">{stats.visitors}</p>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <FaSatelliteDish className="stat-card-icon" />
              <h3 className="stat-card-title">最新留言</h3>
            </div>
            <p className="stat-card-value">{stats.comments}</p>
          </div>
        </div>

        {/* Posts Table */}
        <div className="posts-table-container">
          <div className="posts-table-header">
            <h2>最新文章</h2>
            <div className="filter-controls">
               <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
               <button className={`filter-btn ${filter === 'published' ? 'active' : ''}`} onClick={() => setFilter('published')}>已發佈</button>
               <button className={`filter-btn ${filter === 'draft' ? 'active' : ''}`} onClick={() => setFilter('draft')}>草稿</button>
            </div>
          </div>
          <table className="posts-table">
            <thead>
              <tr>
                <th>標題</th>
                <th>狀態</th>
                <th>建立日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td>{post.title}</td>
                  <td><span className={`post-status ${post.status}`}>{post.status}</span></td>
                  <td>{new Date(post.created_at).toLocaleDateString()}</td>
                  <td className="action-btns">
                    <button className="action-btn edit" onClick={() => navigate(`/admin/edit/${post.id}`)}><FiEdit /></button>
                    <button className="action-btn delete" onClick={() => handleDeletePost(post.id)}><FiTrash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
