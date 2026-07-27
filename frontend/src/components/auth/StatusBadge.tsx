import React from 'react';
import { statusColors, statusBadgeColors } from '../../data/mockData';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colors = statusColors[status as keyof typeof statusColors] || 'text-gray-400 bg-gray-400/10';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
};

interface InventoryStatusBadgeProps {
  status: string;
}

export const InventoryStatusBadge: React.FC<InventoryStatusBadgeProps> = ({ status }) => {
  const colors = statusBadgeColors[status as keyof typeof statusBadgeColors] || 'text-gray-400 bg-gray-400/10';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
};