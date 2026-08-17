import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from '../components/auth/Sidebar';
import Header from '../components/Header';
import { LogOut } from 'lucide-react';

export const MainLayout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      
      {/* LEFT SIDEBAR CONTAINER */}
      <aside className="w-64 bg-[#0F172A] text-slate-300 min-h-screen flex flex-col border-r border-slate-800">
        {/* Brand Logo Header - Exactly h-16 to match Top Navbar height */}
        <div className="h-16 border-b border-slate-800 flex items-center px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white">
              S
            </div>
            <div>
              <div className="font-bold text-sm leading-none">SmartChain</div>
              <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">SUPPLY OS</div>
            </div>
          </div>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="flex-1 overflow-y-auto">
          <Sidebar />
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full text-left text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* RIGHT CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0F19] text-white min-h-screen">
        
        {/* HEADER */}
        <Header />

        {/* DYNAMIC PAGE MODULE CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

      </div>

    </div>
  );
};

export default MainLayout;
