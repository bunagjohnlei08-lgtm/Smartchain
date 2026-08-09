import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

const Settings: React.FC = () => {
  return (
    <div className="w-full space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-xs text-gray-400 mt-1">
          Manage system configuration, company preferences, and integrations.
        </p>
      </div>

      <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700 flex items-center justify-center text-gray-400 mb-4">
          <SettingsIcon className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Settings</h2>
        <p className="text-sm text-gray-400 max-w-md">
          System settings and configuration options will be available here. Use the sidebar dropdown to navigate to specific settings sections.
        </p>
      </div>
    </div>
  );
};

export default Settings;
