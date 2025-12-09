import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Tag,
  BookOpen,
  Film,
  Menu,
  X,
  ChevronRight,
  LogOut,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import './AdminTheme.css'; // 導入暗色主題樣式
import './ModernEnhancements.css'; // 導入現代化增強樣式
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const BREADCRUMB_LABELS = {
  admin: '後台',
  dashboard: '儀表板',
  posts: '文章',
  categories: '分類',
  tags: '標籤',
  notes: '日記',
  books: '書籍',
  editor: '編輯器',
  create: '新增',
  edit: '編輯',
};

const AdminBreadcrumb = () => {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const href = '/' + segments.slice(0, index + 1).join('/');
          const isLast = index === segments.length - 1;
          const label = BREADCRUMB_LABELS[segment] || segment;

          return (
            <React.Fragment key={href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator><ChevronRight /></BreadcrumbSeparator>}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

const sidebarItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: '儀表板', path: '/admin/dashboard' },
  { id: 'posts', icon: FileText, label: '文章', path: '/admin/posts' },
  { id: 'categories', icon: FolderOpen, label: '分類', path: '/admin/categories' },
  { id: 'tags', icon: Tag, label: '標籤', path: '/admin/tags' },
  { id: 'notes', icon: BookOpen, label: '日記', path: '/admin/notes' },
  { id: 'books', icon: BookOpen, label: '書籍', path: '/admin/books' },
  { id: 'collection', icon: Film, label: '收藏館', path: '/admin/collection' },
];

export const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen admin-layout">
      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen transition-all duration-300 bg-card/80 backdrop-blur-md border-r border-border/40",
          sidebarOpen ? "w-64" : "w-16",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-4">
            {sidebarOpen ? (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LayoutDashboard className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Admin Panel</span>
                  <span className="text-xs text-muted-foreground">管理後台</span>
                </div>
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <LayoutDashboard className="h-4 w-4" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                    !sidebarOpen && "justify-center"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="border-t p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3",
                    !sidebarOpen && "justify-center px-0"
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="" alt="Admin" />
                    <AvatarFallback>AD</AvatarFallback>
                  </Avatar>
                  {sidebarOpen && (
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-medium">管理員</span>
                      <span className="text-xs text-muted-foreground">admin@example.com</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>我的帳戶</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  個人資料
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={cn(
          "transition-all duration-300",
          sidebarOpen ? "md:ml-64" : "md:ml-16"
        )}
      >
        {/* Header */}
        <header 
          className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/40 bg-card/80 backdrop-blur-md px-4 sm:px-6"
        >
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu />
          </Button>

          <Separator orientation="vertical" className="h-6" />
          
          <AdminBreadcrumb />
        </header>

        {/* Content */}
        <main className="min-h-screen bg-background p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminLayout;
