import React from 'react';
import { Outlet } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import { useTheme } from '../../context/ThemeContext';

const AdminLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [userName, setUserName] = React.useState('User');
  const [userInitials, setUserInitials] = React.useState('U');
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
        {/* Top Bar */}
        <header className="bg-[#090d16]/80 backdrop-blur-xl border-b border-slate-800/60 px-4 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
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
            <button className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* User Profile Dropdown */}
            <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-slate-800 rounded-xl px-2 py-1 transition-all">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm font-semibold">
                 {userInitials}
               </div>
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
        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-transparent">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
