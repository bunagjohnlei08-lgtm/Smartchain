import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import QASidebar from '../components/layout/QASidebar';
import { useTheme } from '../context/ThemeContext';

const QALayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [userInitials, setUserInitials] = React.useState('U');
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
          const parts = fullName.split(/\s+/);
          const first = parts[0]?.[0] ?? '';
          const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
          setUserInitials((first + last).toUpperCase() || 'U');
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
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="xl:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 text-white shadow-lg"
        aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMobileMenuOpen}
        aria-controls="qa-sidebar"
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div
        id="qa-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out xl:relative xl:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <QASidebar />
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
        <header className="sticky top-0 z-40 flex h-16 min-h-16 max-h-16 flex-shrink-0 items-center overflow-hidden border-b border-slate-800/80 bg-[#090d16] px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center">
            <div className="w-10 flex-shrink-0 xl:hidden" />
            <div className="hidden min-w-0 md:block">
              <h1 className="truncate whitespace-nowrap text-sm font-semibold text-white">Quality Assurance & Control</h1>
              <p className="truncate whitespace-nowrap text-xs text-slate-400">Plant 02 — Receiving Inspection</p>
            </div>
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

            {/* User Profile Badge */}
            <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-slate-800 rounded-xl px-2 py-1 transition-all h-full">
              <div className="w-8 h-8 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center text-sm font-semibold">
                {userInitials}
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-sm text-slate-300 leading-none">{userName}</span>
                <span className="text-[10px] text-slate-500 leading-none mt-0.5">QA/QC Supervisor</span>
              </div>
              <ChevronDown size={16} className="text-slate-400 hidden sm:block" />
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

export default QALayout;
