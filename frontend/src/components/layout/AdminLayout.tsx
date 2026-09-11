import React from 'react';
import { Outlet } from 'react-router-dom';
import {
  ChevronDown,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import { useTheme } from '../../context/ThemeContext';
import { readStoredUser, subscribeToStoredUser, type AuthUser } from '../../lib/authUser';
import NotificationBell from '../NotificationBell';
import UserAvatar from '../UserAvatar';

const AdminLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [profilePhotoUrl, setProfilePhotoUrl] = React.useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    const applyUser = (user: AuthUser | null) => {
      const fullName = user?.name?.trim();
      if (!fullName) return;
      setUserName(fullName);
      setProfilePhotoUrl(user?.profile_photo_url ?? null);
    };
    applyUser(readStoredUser());
    return subscribeToStoredUser(applyUser);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#090d16]">
      {/* Mobile Hamburger */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="xl:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 text-white shadow-lg"
        aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMobileMenuOpen}
        aria-controls="admin-sidebar"
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-[#090d16] border-r border-slate-800/60 transition-transform duration-300 ease-in-out xl:relative xl:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar />
      </div>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 xl:hidden"
          aria-hidden="true"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="admin-main flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-transparent">
        {/* Top Bar */}
        <header className="bg-white dark:bg-[#090d16]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60 px-4 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-20">
          <div className="xl:hidden w-10" />

          {/* Right Action Group */}
          <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifications */}
            <NotificationBell viewAllPath="/admin/notifications" />

            {/* User Profile Dropdown */}
            <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-slate-800 rounded-xl px-2 py-1 transition-all">
              <UserAvatar name={userName} photoUrl={profilePhotoUrl} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-400" />
               <span className="hidden sm:inline text-sm text-slate-300">{userName}</span>
              <ChevronDown size={16} className="text-slate-400" />
            </div>

            {/* Logout */}
            <button
              onClick={() => {
                sessionStorage.removeItem('isAuthenticated');
                sessionStorage.removeItem('userRole');
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                window.location.href = '/login';
              }}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-all"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-transparent">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
