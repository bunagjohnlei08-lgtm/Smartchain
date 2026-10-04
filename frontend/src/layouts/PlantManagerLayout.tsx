import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  Menu,
} from 'lucide-react';
import PlantManagerSidebar from '../components/layout/PlantManagerSidebar';
import { useTheme } from '../context/ThemeContext';
import { readStoredUser, subscribeToStoredUser, type AuthUser } from '../lib/authUser';
import NotificationBell from '../components/NotificationBell';
import UserAvatar from '../components/UserAvatar';
import ProfileLogoutMenu from '../components/ProfileLogoutMenu';
import { PlantManagerDetailOverlayContext } from '../components/layout/PlantManagerDetailOverlayContext';
import { logout } from '../lib/logout';

const PlantManagerLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isDetailOverlayOpen, setIsDetailOverlayOpen] = React.useState(false);
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

  React.useEffect(() => {
    if (isDetailOverlayOpen) setIsMobileMenuOpen(false);
  }, [isDetailOverlayOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <PlantManagerDetailOverlayContext.Provider value={setIsDetailOverlayOpen}>
    <div className="operations-shell plant-manager-shell flex h-screen overflow-hidden bg-[#090d16]">
      {/* Mobile Hamburger */}
      {!isMobileMenuOpen && !isDetailOverlayOpen && (
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="operations-mobile-menu-button xl:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white text-slate-900 shadow-lg dark:bg-slate-900 dark:text-white"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls="plant-manager-sidebar"
        >
          <Menu size={24} />
        </button>
      )}

      {/* Sidebar */}
      <div
        id="plant-manager-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 transform shadow-2xl transition-transform duration-300 ease-in-out xl:relative xl:z-40 xl:translate-x-0 xl:shadow-none ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <PlantManagerSidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 xl:hidden"
          aria-hidden="true"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#090d16]">
        {/* Top Bar */}
        <header className="operations-topbar fixed inset-x-0 top-0 z-30 flex h-16 flex-shrink-0 items-center border-b border-slate-800/80 bg-[#090d16] px-4 md:px-6 xl:relative xl:inset-auto xl:z-40">
          <div className="flex items-center flex-1 min-w-0">
            <div className="operations-mobile-menu-spacer xl:hidden w-10" />
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
            <NotificationBell viewAllPath="/plant-manager/notifications" />

            {/* User Profile Dropdown */}
            <ProfileLogoutMenu
              profilePath="/plant-manager/profile"
              triggerLabel="Open Plant Manager profile menu"
              onConfirmLogout={handleLogout}
            >
              <UserAvatar name={userName} photoUrl={profilePhotoUrl} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-400" />
              <span className="hidden sm:inline text-sm text-slate-300">{userName}</span>
            </ProfileLogoutMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="plant-manager-main flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-[#090d16] pt-14 xl:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
    </PlantManagerDetailOverlayContext.Provider>
  );
};

export default PlantManagerLayout;
