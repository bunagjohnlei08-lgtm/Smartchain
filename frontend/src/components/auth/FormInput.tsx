import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface FormInputProps {
  label: string;
  type: string;
  name: string;
  autoComplete?: string;
  placeholder?: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  showPasswordToggle?: boolean;
  leadingIcon?: React.ReactNode;
  disabled?: boolean;
}

const FormInput: React.FC<FormInputProps> = ({
  label,
  type,
  name,
  autoComplete,
  placeholder = '',
  value,
  onChange,
  error,
  required = false,
  showPasswordToggle = false,
  leadingIcon,
  disabled = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-1.5" style={{ color: '#A2AAB8' }}>
        {label} {required && <span className="text-[#EF4444]">*</span>}
      </label>
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400">
            {leadingIcon}
          </span>
        )}
        <input
          id={name}
          type={inputType}
          name={name}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={`relative block min-h-12 w-full appearance-none rounded-xl border py-3 pr-12 text-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-950/70 disabled:text-slate-500 disabled:opacity-70 ${error ? 'border-red-500 hover:border-red-400 focus:border-red-400 focus:ring-red-500/20' : 'border-slate-700 hover:border-slate-500 focus:border-blue-500 focus:ring-blue-500/30'} ${leadingIcon ? 'pl-12' : 'pl-4'}`}
          style={{
            backgroundColor: disabled ? '#030914' : '#050e1b',
            color: '#F5F7FA',
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          placeholder={placeholder}
        />
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            className="absolute right-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
};

export default FormInput;
