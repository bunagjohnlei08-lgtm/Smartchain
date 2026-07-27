import React from 'react';
import type { KPI } from '../../types';
import {
  MoreVertical,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface KpiCardProps {
  data: KPI;
}

const KpiCard: React.FC<KpiCardProps> = ({ data }) => {
  const getTrendColor = () => {
    if (data.trend === 'up') return 'text-green-400';
    if (data.trend === 'down') return 'text-red-400';
    return 'text-[#94A3B8]';
  };

  return (
    <div className="bg-[#162033] border border-[#263244] rounded-2xl p-6 hover:border-[#3B82F6]/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-blue-500/10 rounded-lg">{data.icon}</div>
        <button className="text-[#64748B] hover:text-white transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-4">
        <p className="text-[#94A3B8] text-sm">{data.label}</p>
        <p className="text-2xl font-bold text-white mt-1">{data.value}</p>
        {data.change && (
          <p className={`text-sm mt-1 ${getTrendColor()} flex items-center gap-1`}>
            {data.trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {data.trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {data.change}
          </p>
        )}
        {data.subtitle && (
          <p className="text-sm text-[#64748B] mt-1">{data.subtitle}</p>
        )}
      </div>
    </div>
  );
};

export default KpiCard;
