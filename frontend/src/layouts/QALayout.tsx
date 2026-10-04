import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  Menu,
} from 'lucide-react';
import QASidebar from '../components/layout/QASidebar';
import { useTheme } from '../context/ThemeContext';
import { readStoredUser, subscribeToStoredUser, type AuthUser } from '../lib/authUser';
import NotificationBell from '../components/NotificationBell';
import UserAvatar from '../components/UserAvatar';
import ProfileLogoutMenu from '../components/ProfileLogoutMenu';
import { logout } from '../lib/logout';

const QALayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [profilePhotoUrl, setProfilePhotoUrl] = React.useState<string | null>(null);
  const navigate = useNavigate();
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

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="operations-shell qa-shell flex h-screen overflow-hidden bg-[#090d16]">
      {/* Mobile Hamburger */}
      {!isMobileMenuOpen && (
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="operations-mobile-menu-button xl:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white text-slate-900 shadow-lg dark:bg-slate-900 dark:text-white"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls="qa-sidebar"
        >
          <Menu size={24} />
        </button>
      )}

      {/* Sidebar */}
      <div
        id="qa-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out xl:relative xl:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <QASidebar onClose={() => setIsMobileMenuOpen(false)} />
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#090d16]">
        {/* Top Bar */}
        <header className="operations-topbar fixed inset-x-0 top-0 z-30 flex h-16 min-h-16 max-h-16 flex-shrink-0 items-center border-b border-slate-800/80 bg-[#090d16] px-4 md:px-6 xl:relative xl:inset-auto xl:z-40">
          <div className="flex min-w-0 flex-1 items-center">
            <div className="operations-mobile-menu-spacer w-10 flex-shrink-0 xl:hidden" />
            <div className="hidden min-w-0 md:block">
              <h1 className="truncate whitespace-nowrap text-sm font-semibold text-white">Quality Assurance & Control</h1>
              <p className="truncate whitespace-nowrap text-xs text-slate-400">Plant 02 — Receiving Inspection</p>
            </div>
          </div>

          <div className="operations-header-actions flex items-center gap-3 h-full flex-shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="operations-header-icon-button p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifications */}
            <NotificationBell viewAllPath="/qa/notifications" />

            {/* User Profile Dropdown */}
            <ProfileLogoutMenu
              profilePath="/qa/profile"
              triggerLabel="Open QA profile menu"
              onConfirmLogout={handleLogout}
            >
              <UserAvatar name={userName} photoUrl={profilePhotoUrl} className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600/20 text-sm font-semibold text-cyan-400" />
              <div className="hidden sm:flex flex-col">
                <span className="text-sm text-slate-300 leading-none">{userName}</span>
                <span className="text-[10px] text-slate-500 leading-none mt-0.5">QA/QC Supervisor</span>
              </div>
            </ProfileLogoutMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="qa-main flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-[#090d16] pt-14 xl:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default QALayout;
