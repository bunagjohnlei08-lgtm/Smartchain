import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  Moon,
  Sun,
  Menu,
  LogOut,
} from 'lucide-react';
import PlantManagerSidebar from '../components/layout/PlantManagerSidebar';
import { useTheme } from '../context/ThemeContext';

const PlantManagerLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [userInitial, setUserInitial] = React.useState('U');
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem('user');
      if (raw) {
        const user: { name?: string } = JSON.parse(raw);
        const fullName = user.name?.trim() || '';
        if (fullName) {
          setUserName(fullName);
          setUserInitial(fullName.charAt(0).toUpperCase() || 'U');
        }
      }
    } catch {
      // ignore parse errors; fallback initials remain
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#090d16]">
      {/* Mobile Hamburger */}
      {!isMobileMenuOpen && (
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="xl:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 text-white shadow-lg"
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
        <header className="flex items-center h-16 px-4 md:px-6 border-b border-slate-800/80 bg-[#090d16] sticky top-0 z-40 flex-shrink-0">
          <div className="flex items-center flex-1 min-w-0">
            <div className="xl:hidden w-10" />
          </div>

          <div className="flex items-center gap-3 h-full flex-shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifications */}
            <button className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* User Profile Dropdown */}
            <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-slate-800 rounded-xl px-2 py-1 transition-all h-full">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm font-semibold">
                {userInitial}
              </div>
              <span className="hidden sm:inline text-sm text-slate-300">{userName}</span>
              <ChevronDown size={16} className="text-slate-400" />
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-[#090d16]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default PlantManagerLayout;
