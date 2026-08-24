import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut } from 'lucide-react';

export default function AdminHeader() {
  const [userName, setUserName] = useState('User');
  const [userInitials, setUserInitials] = useState('U');
  const navigate = useNavigate();

  useEffect(() => {
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
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex justify-end items-center h-16 px-4 md:px-6 border-b border-gray-800/80 bg-[#090d16] text-white sticky top-0 z-40 flex-shrink-0">
      {/* RIGHT ACTION CONTROLS */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Notifications */}
        <button className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white transition-all relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-[#090d16]"></span>
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-gray-800 rounded-xl px-2 py-1 transition-all">
           <div className="w-9 h-9 bg-blue-900/60 text-blue-400 font-semibold rounded-full flex items-center justify-center text-sm border border-blue-700/40">
              {userInitials}
           </div>
           <span className="hidden sm:inline text-sm text-gray-300">{userName}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-rose-400 transition-all"
          aria-label="Logout"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
