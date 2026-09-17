import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import {
  ChevronDown,
  Moon,
  Sun,
  Menu,
  LogOut,
  UserRound,
} from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import { useTheme } from '../../context/ThemeContext';
import { readStoredUser, subscribeToStoredUser, type AuthUser } from '../../lib/authUser';
import NotificationBell from '../NotificationBell';
import UserAvatar from '../UserAvatar';
import { AdminDetailOverlayContext } from './AdminDetailOverlayContext';
import { logout } from '../../lib/logout';

const AdminLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isDetailOverlayOpen, setIsDetailOverlayOpen] = React.useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [profilePhotoUrl, setProfilePhotoUrl] = React.useState<string | null>(null);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);
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

  React.useEffect(() => {
    if (isDetailOverlayOpen) setIsMobileMenuOpen(false);
  }, [isDetailOverlayOpen]);

  React.useEffect(() => {
    const closeProfileMenu = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
    };
    const closeOverlays = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsProfileMenuOpen(false);
      setIsLogoutDialogOpen(false);
    };
    document.addEventListener('mousedown', closeProfileMenu);
    document.addEventListener('keydown', closeOverlays);
    return () => {
      document.removeEventListener('mousedown', closeProfileMenu);
      document.removeEventListener('keydown', closeOverlays);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <AdminDetailOverlayContext.Provider value={setIsDetailOverlayOpen}>
    <div className="admin-shell flex h-screen overflow-hidden bg-[#090d16]">
      {/* Sidebar */}
      <div
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-[#090d16] border-r border-slate-800/60 transition-transform duration-300 ease-in-out xl:relative xl:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar onMobileClose={() => setIsMobileMenuOpen(false)} />
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
        <header className="admin-topbar bg-white dark:bg-[#090d16]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60 h-16 px-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-20">
          {/* Mobile Hamburger */}
          {!isMobileMenuOpen && !isDetailOverlayOpen && <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="admin-mobile-menu-button relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-900 dark:bg-slate-900 dark:text-white xl:hidden"
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-sidebar"
          >
            <Menu size={20} />
          </button>}

          {/* Right Action Group */}
          <div className="admin-header-actions ml-auto flex flex-shrink-0 items-center gap-2 xl:gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="admin-header-icon-button p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifications */}
            <NotificationBell viewAllPath="/admin/notifications" />

            {/* User Profile Dropdown */}
            <div ref={profileMenuRef} className="relative ml-0 xl:ml-2">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((open) => !open)}
                className="admin-profile-control flex items-center gap-1 rounded-xl px-2 py-1 text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 xl:gap-2"
                aria-label="Open profile menu"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                aria-controls="admin-profile-menu"
              >
                <UserAvatar name={userName} photoUrl={profilePhotoUrl} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-600 dark:text-blue-400" />
                <span className="hidden max-w-36 truncate text-sm sm:inline">{userName}</span>
                <ChevronDown size={16} className={`text-slate-500 transition-transform dark:text-slate-400 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileMenuOpen && (
                <div
                  id="admin-profile-menu"
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-200 dark:shadow-black/30"
                >
                  <Link
                    to="/admin/profile"
                    role="menuitem"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:hover:bg-slate-800"
                  >
                    <UserRound size={18} aria-hidden="true" />
                    Profile
                  </Link>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsLogoutDialogOpen(true);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 outline-none transition-colors hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <LogOut size={18} aria-hidden="true" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-transparent">
          <Outlet />
        </main>
      </div>

      {isLogoutDialogOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-logout-title"
          aria-describedby="admin-logout-description"
          onClick={() => setIsLogoutDialogOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#0d1322] dark:text-white sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="admin-logout-title" className="text-lg font-semibold">Log out?</h2>
            <p id="admin-logout-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Are you sure you want to log out?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setIsLogoutDialogOpen(false)}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:ring-offset-[#0d1322]"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminDetailOverlayContext.Provider>
  );
};

export default AdminLayout;
