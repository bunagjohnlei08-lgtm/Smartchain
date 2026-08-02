import React from 'react';
import { Search, Bell, Sun } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-800 bg-[#0B0F19] text-white flex items-center justify-between px-6 shrink-0">
       
      {/* Global Search Bar */}
      <div className="relative w-96">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"/>
        <input 
          type="text" 
          placeholder="Search SKUs, POs, shipments..." 
          className="w-full bg-[#111827] text-white border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
        />
      </div>

      {/* Top Right Action Icons */}
      <div className="flex items-center gap-3">
        <button 
          type="button"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <Sun className="w-4 h-4"/>
        </button>
        <button className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 relative transition">
          <Bell className="w-4 h-4"/>
          <span className="w-2 h-2 bg-rose-500 rounded-full absolute top-1.5 right-1.5" />
        </button>
      </div>

    </header>
  );
};

export default Header;
