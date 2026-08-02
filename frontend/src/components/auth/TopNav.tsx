import React from 'react';
import {
  MessageSquare,
  Bell,
  Sun,
  Search,
  ChevronRight
} from 'lucide-react';

interface TopNavProps {
  breadcrumb: string;
}

const TopNav: React.FC<TopNavProps> = ({ breadcrumb }) => {
  return (
    <div className="bg-[#0B0F19] border-b border-slate-800 text-white px-8 py-4 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-6 flex-1">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-sm">SmartChain</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white font-medium">{breadcrumb}</span>
        </div>
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search SKUs, POs, shipments..."
            className="w-full bg-[#162033] text-white border border-[#263244] rounded-lg pl-10 pr-4 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-lg hover:bg-[#162033] transition-colors text-slate-400 hover:text-white">
          <MessageSquare className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-[#162033] transition-colors text-slate-400 hover:text-white relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <button
          className="p-2 rounded-lg hover:bg-[#162033] transition-colors text-slate-400 hover:text-white"
        >
          <Sun className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
          <span className="text-blue-400 font-medium text-sm">JD</span>
        </div>
      </div>
    </div>
  );
};

export default TopNav;
