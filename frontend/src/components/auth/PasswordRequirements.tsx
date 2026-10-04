import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { passwordRequirements } from '../../lib/passwordPolicy';

interface PasswordRequirementsProps {
  password: string;
  appearance?: 'dark' | 'light';
}

const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password, appearance = 'dark' }) => {
  const isLight = appearance === 'light';

  return (
    <div
      className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50 dark:border-slate-700/80 dark:bg-slate-950/35' : 'border-slate-700/80 bg-slate-950/35'}`}
      aria-live="polite"
    >
      <p className={`text-xs font-medium ${isLight ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300'}`}>Password must contain:</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
        {passwordRequirements(password).map((requirement) => (
          <li
            key={requirement.key}
            className={`flex items-center gap-2 text-xs ${requirement.met
              ? isLight ? 'text-emerald-700 dark:text-emerald-300' : 'text-emerald-300'
              : isLight ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400'}`}
          >
            {requirement.met
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>{requirement.label}</span>
            <span className="sr-only">{requirement.met ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordRequirements;
