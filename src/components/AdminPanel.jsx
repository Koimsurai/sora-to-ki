import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// ✅ 優化: 使用解構引入 (Vite 的 tree-shaking 會自動移除未使用的 icons)
import {
  FiGrid,
  FiFileText,
  FiMessageSquare,
  FiBarChart2,
  FiLogOut,
  FiPlus,
  FiEdit,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiLoader,
  FiAlertCircle,
  FiUsers,
  FiSettings,
  FiMenu,
  FiX,
  FiBell,
  FiUser
} from 'react-icons/fi';
import { FaRocket, FaSatelliteDish, FaUserFriends } from 'react-icons/fa';
import './AdminPanel.css';

const AdminPanel = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ totalPosts: 0, visitors: 0, comments: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, published, draft
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
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
    if (!window.confirm('確定要刪除這篇文章嗎？此操作無法撤銷。')) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // 使用更好的通知方式
        showNotification('文章已成功刪除', 'success');
        fetchData(); // 刷新列表
      } else {
        const errorData = await response.json().catch(() => ({}));
        showNotification(`刪除失敗: ${errorData.message || response.statusText}`, 'error');
      }
    } catch (error) {
      console.error('刪除文章失敗:', error);
      showNotification('刪除失敗，請檢查網路連接', 'error');
    }
  };

  const handleToggleStatus = async (postId, currentStatus) => {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    const action = newStatus === 'published' ? '發布' : '撤回';
    
    if (!window.confirm(`確定要${action}這篇文章嗎？`)) return;

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/posts/${postId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        showNotification(`文章已${action}`, 'success');
        fetchData();
      } else {
        const errorData = await response.json().catch(() => ({}));
        showNotification(`${action}失敗: ${errorData.message || response.statusText}`, 'error');
      }
    } catch (error) {
      console.error(`${action}文章失敗:`, error);
      showNotification(`${action}失敗，請檢查網路連接`, 'error');
    }
  };

  const showNotification = (message, type) => {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加樣式
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '1rem 1.5rem',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '500',
      zIndex: '1000',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease',
      backgroundColor: type === 'success' ? '#48bb78' : '#e53e3e'
    });

    document.body.appendChild(notification);
    
    // 顯示動畫
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // 自動消失
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/');
  };

  const sidebarItems = [
    { id: 'dashboard', icon: FiBarChart2, label: '控制台', badge: null },
    { id: 'posts', icon: FiFileText, label: '文章管理', badge: stats.totalPosts },
    { id: 'users', icon: FiUsers, label: '用戶管理', badge: null },
    { id: 'settings', icon: FiSettings, label: '系統設置', badge: null }
  ];

  return (
    <div className="admin-panel">
      {/* 側邊欄 */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-section">
            <div className="cosmic-orb"></div>
            {!sidebarCollapsed && <span className="logo-text">Koimurai Admin</span>}
          </div>
          <button 
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <FiMenu size={20} /> : <FiX size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon size={20} />
              {!sidebarCollapsed && (
                <>
                  <span className="nav-label">{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* 主要內容區域 */}
      <main className="admin-main">
        {/* 頂部導航欄 */}
        <header className="admin-header">
          <div className="header-left">
            <h1 className="page-title">
              {sidebarItems.find(item => item.id === activeTab)?.label}
            </h1>
          </div>
          <div className="header-right">
            <div className="search-container">
              <FiSearch size={16} />
              <input 
                type="text" 
                placeholder="搜尋文章..." 
                className="search-input"
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    setSearchTerm(globalSearchTerm);
                    setCurrentPage(1);
                  }
                }}
              />
            </div>
            <button className="notification-btn">
              <FiBell size={20} />
              <span className="notification-badge">3</span>
            </button>
            <div className="user-menu">
              <FiUser size={20} />
              <span>管理員</span>
            </div>
            <button onClick={handleLogout} className="logout-btn">
              <FiLogOut size={20} />
            </button>
          </div>
        </header>

        {/* 內容面板 */}
        <div className="admin-content">
          {isLoading ? (
            <div className="loading-container">
              <div className="cosmic-loader">
                <div className="planet"></div>
                <div className="orbit"></div>
              </div>
              <p className="loading-text">正在載入管理面板...</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardContent 
                  stats={stats} 
                  posts={posts} 
                  navigate={navigate} 
                  handleDeletePost={handleDeletePost} 
                  handleToggleStatus={handleToggleStatus}
                  setFilter={setFilter} 
                  filter={filter} 
                />
              )}
              {activeTab === 'posts' && (
                <PostsContent 
                  posts={posts} 
                  navigate={navigate} 
                  handleDeletePost={handleDeletePost} 
                  handleToggleStatus={handleToggleStatus}
                  setFilter={setFilter} 
                  filter={filter}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  setCurrentPage={setCurrentPage}
                />
              )}
              {activeTab === 'users' && <UsersContent />}
              {activeTab === 'settings' && <SettingsContent />}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

// 控制台內容
const DashboardContent = ({ stats, posts, navigate, handleDeletePost, handleToggleStatus, setFilter, filter }) => (
    <div className="dashboard-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <FaRocket className="stat-card-icon" />
              <h3 className="stat-card-title">總文章數</h3>
            </div>
            <p className="stat-card-value">{stats.totalPosts}</p>
            <div className="stat-card-trend">
              <span className="trend-up">+{Math.floor(stats.totalPosts * 0.1)} 本月</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <FaUserFriends className="stat-card-icon" />
              <h3 className="stat-card-title">訪客統計</h3>
            </div>
            <p className="stat-card-value">{stats.visitors}</p>
            <div className="stat-card-trend">
              <span className="trend-up">+12% 本週</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <FaSatelliteDish className="stat-card-icon" />
              <h3 className="stat-card-title">留言總數</h3>
            </div>
            <p className="stat-card-value">{stats.comments}</p>
            <div className="stat-card-trend">
              <span className="trend-neutral">+{Math.floor(stats.comments * 0.05)} 本週</span>
            </div>
          </div>
        </div>

        <div className="recent-posts">
            <div className="section-header">
                <h3>最新文章</h3>
                <div className="filter-controls">
                   <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
                   <button className={`filter-btn ${filter === 'published' ? 'active' : ''}`} onClick={() => setFilter('published')}>已發佈</button>
                   <button className={`filter-btn ${filter === 'draft' ? 'active' : ''}`} onClick={() => setFilter('draft')}>草稿</button>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/admin/create')}>
                    <FiPlus size={16} />
                    新增文章
                </button>
            </div>
            {posts.length > 0 ? (
              <div className="posts-table">
                  <div className="table-header">
                      <div>標題</div>
                      <div>狀態</div>
                      <div>建立日期</div>
                      <div>操作</div>
                  </div>
                  {posts.slice(0, 5).map(post => (
                      <div key={post.id} className="table-row">
                          <div className="post-title" title={post.title}>
                            {post.title}
                          </div>
                          <div>
                              <button 
                                className={`status-badge ${post.status} clickable`}
                                onClick={() => handleToggleStatus(post.id, post.status)}
                                title={`點擊${post.status === 'published' ? '撤回' : '發布'}`}
                              >
                                  {post.status === 'published' ? '已發布' : '草稿'}
                              </button>
                          </div>
                          <div>{new Date(post.created_at).toLocaleDateString('zh-TW')}</div>
                          <div className="actions">
                              <button 
                                className="btn-icon" 
                                onClick={() => navigate(`/admin/edit/${post.id}`)}
                                title="編輯文章"
                              >
                                  <FiEdit size={16} />
                              </button>
                              <button 
                                className="btn-icon danger" 
                                onClick={() => handleDeletePost(post.id)}
                                title="刪除文章"
                              >
                                  <FiTrash2 size={16} />
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
            ) : (
              <div className="empty-state">
                <FiFileText size={48} />
                <h3>還沒有文章</h3>
                <p>開始創建您的第一篇文章吧！</p>
                <button className="btn btn-primary" onClick={() => navigate('/admin/create')}>
                  <FiPlus size={16} />
                  創建文章
                </button>
              </div>
            )}
        </div>
    </div>
);

// 文章管理內容
const PostsContent = ({ posts, navigate, handleDeletePost, handleToggleStatus, setFilter, filter, currentPage, totalPages, setCurrentPage }) => (
    <div className="posts-content">
        <div className="content-header">
            <h2>文章管理</h2>
            <div className="header-actions">
              <div className="filter-controls">
                 <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setCurrentPage(1); }}>
                   全部 ({posts.filter(() => true).length})
                 </button>
                 <button className={`filter-btn ${filter === 'published' ? 'active' : ''}`} onClick={() => { setFilter('published'); setCurrentPage(1); }}>
                   已發佈 ({posts.filter(p => p.status === 'published').length})
                 </button>
                 <button className={`filter-btn ${filter === 'draft' ? 'active' : ''}`} onClick={() => { setFilter('draft'); setCurrentPage(1); }}>
                   草稿 ({posts.filter(p => p.status === 'draft').length})
                 </button>
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/admin/create')}>
                  <FiPlus size={16} />
                  新增文章
              </button>
            </div>
        </div>
        
        {posts.length > 0 ? (
          <>
            <div className="posts-table">
                <div className="table-header">
                    <div>標題</div>
                    <div>狀態</div>
                    <div>建立日期</div>
                    <div>最後修改</div>
                    <div>操作</div>
                </div>
                {posts.map(post => (
                    <div key={post.id} className="table-row">
                        <div className="post-title" title={post.title}>
                          <div className="title-text">{post.title}</div>
                          {post.excerpt && (
                            <div className="post-excerpt">{post.excerpt.substring(0, 80)}...</div>
                          )}
                        </div>
                        <div>
                            <button 
                              className={`status-badge ${post.status} clickable`}
                              onClick={() => handleToggleStatus(post.id, post.status)}
                              title={`點擊${post.status === 'published' ? '撤回' : '發布'}`}
                            >
                                {post.status === 'published' ? '已發布' : '草稿'}
                            </button>
                        </div>
                        <div>{new Date(post.created_at).toLocaleDateString('zh-TW')}</div>
                        <div>{new Date(post.updated_at || post.created_at).toLocaleDateString('zh-TW')}</div>
                        <div className="actions">
                            <button 
                              className="btn-icon" 
                              onClick={() => window.open(`/blog/${post.id}`, '_blank')}
                              title="預覽文章"
                            >
                                <FiSearch size={16} />
                            </button>
                            <button 
                              className="btn-icon" 
                              onClick={() => navigate(`/admin/edit/${post.id}`)}
                              title="編輯文章"
                            >
                                <FiEdit size={16} />
                            </button>
                            <button 
                              className="btn-icon danger" 
                              onClick={() => handleDeletePost(post.id)}
                              title="刪除文章"
                            >
                                <FiTrash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <FiChevronLeft size={16} />
                  上一頁
                </button>
                
                <div className="pagination-info">
                  第 {currentPage} 頁，共 {totalPages} 頁
                </div>
                
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一頁
                  <FiChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <FiFileText size={48} />
            <h3>還沒有文章</h3>
            <p>開始創建您的第一篇文章吧！</p>
            <button className="btn btn-primary" onClick={() => navigate('/admin/create')}>
              <FiPlus size={16} />
              創建文章
            </button>
          </div>
        )}
    </div>
);

// 用戶管理內容
const UsersContent = () => (
  <div className="users-content">
    <div className="content-header">
      <h2>用戶管理</h2>
    </div>
    <div className="placeholder-content">
      <p>用戶管理功能開發中...</p>
    </div>
  </div>
);

// 設置內容
const SettingsContent = () => (
  <div className="settings-content">
    <div className="content-header">
      <h2>系統設置</h2>
    </div>
    <div className="placeholder-content">
      <p>系統設置功能開發中...</p>
    </div>
  </div>
);

export default AdminPanel;
