import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  Settings, 
  BarChart3, 
  Menu, 
  X, 
  Plus, 
  Edit, 
  Trash2,
  Search,
  Bell,
  User,
  LogOut
} from 'lucide-react';
import './AdminPanel.css';

const AdminPanel = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({
    totalPosts: 0,
    totalViews: 0,
    totalUsers: 0,
    todayVisits: 0
  });

  useEffect(() => {
    // 模擬數據載入
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    // 模擬API調用
    setTimeout(() => {
      setStats({
        totalPosts: 23,
        totalViews: 1547,
        totalUsers: 89,
        todayVisits: 47
      });
      setPosts([
        { id: 1, title: '黑洞探索之旅', views: 234, status: 'published', date: '2025-01-15' },
        { id: 2, title: '宇宙的起源', views: 156, status: 'draft', date: '2025-01-14' },
        { id: 3, title: '星際旅行的可能性', views: 89, status: 'published', date: '2025-01-13' }
      ]);
    }, 500);
  };

  const sidebarItems = [
    { id: 'dashboard', icon: BarChart3, label: '控制台', badge: null },
    { id: 'posts', icon: FileText, label: '文章管理', badge: '23' },
    { id: 'users', icon: Users, label: '用戶管理', badge: null },
    { id: 'settings', icon: Settings, label: '系統設置', badge: null }
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
            {sidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
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
              <Search size={16} />
              <input type="text" placeholder="搜尋..." className="search-input" />
            </div>
            <button className="notification-btn">
              <Bell size={20} />
              <span className="notification-badge">3</span>
            </button>
            <div className="user-menu">
              <User size={20} />
              <span>管理員</span>
            </div>
            <button className="logout-btn">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* 內容面板 */}
        <div className="admin-content">
          {activeTab === 'dashboard' && <DashboardContent stats={stats} posts={posts} />}
          {activeTab === 'posts' && <PostsContent posts={posts} />}
          {activeTab === 'users' && <UsersContent />}
          {activeTab === 'settings' && <SettingsContent />}
        </div>
      </main>
    </div>
  );
};

// 控制台內容
const DashboardContent = ({ stats, posts }) => (
  <div className="dashboard-content">
    {/* 統計卡片 */}
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon">
          <FileText size={24} />
        </div>
        <div className="stat-info">
          <div className="stat-value">{stats.totalPosts}</div>
          <div className="stat-label">總文章數</div>
        </div>
        <div className="stat-trend positive">+2.5%</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon">
          <BarChart3 size={24} />
        </div>
        <div className="stat-info">
          <div className="stat-value">{stats.totalViews.toLocaleString()}</div>
          <div className="stat-label">總瀏覽量</div>
        </div>
        <div className="stat-trend positive">+12.3%</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon">
          <Users size={24} />
        </div>
        <div className="stat-info">
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="stat-label">註冊用戶</div>
        </div>
        <div className="stat-trend positive">+5.7%</div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon">
          <Bell size={24} />
        </div>
        <div className="stat-info">
          <div className="stat-value">{stats.todayVisits}</div>
          <div className="stat-label">今日訪問</div>
        </div>
        <div className="stat-trend negative">-1.2%</div>
      </div>
    </div>

    {/* 最近文章 */}
    <div className="recent-posts">
      <div className="section-header">
        <h3>最近文章</h3>
        <button className="btn btn-primary">
          <Plus size={16} />
          新增文章
        </button>
      </div>
      <div className="posts-table">
        <div className="table-header">
          <div>標題</div>
          <div>狀態</div>
          <div>瀏覽量</div>
          <div>日期</div>
          <div>操作</div>
        </div>
        {posts.map(post => (
          <div key={post.id} className="table-row">
            <div className="post-title">{post.title}</div>
            <div>
              <span className={`status-badge ${post.status}`}>
                {post.status === 'published' ? '已發布' : '草稿'}
              </span>
            </div>
            <div>{post.views}</div>
            <div>{post.date}</div>
            <div className="actions">
              <button className="btn-icon">
                <Edit size={16} />
              </button>
              <button className="btn-icon">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 文章管理內容
const PostsContent = ({ posts }) => (
  <div className="posts-content">
    <div className="content-header">
      <h2>文章管理</h2>
      <button className="btn btn-primary">
        <Plus size={16} />
        新增文章
      </button>
    </div>
    {/* 這裡會包含完整的文章列表和編輯功能 */}
    <div className="placeholder-content">
      <p>文章管理功能開發中...</p>
    </div>
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
