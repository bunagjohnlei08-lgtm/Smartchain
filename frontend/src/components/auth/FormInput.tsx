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
  appearance?: 'dark' | 'light';
  maxLength?: number;
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
  appearance = 'dark',
  maxLength,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;
  const isLight = appearance === 'light';

  return (
    <div>
      <label htmlFor={name} className={`mb-1 block text-[13px] font-medium lg:text-xs ${isLight ? 'text-slate-700' : 'text-[#A2AAB8]'}`}>
        {label} {required && <span className="text-[#EF4444]">*</span>}
      </label>
      <div className="relative">
        {leadingIcon && (
          <span className={`pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
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
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={`relative block min-h-[42px] w-full appearance-none rounded-xl border py-2 pr-11 text-[13px] transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 lg:min-h-11 ${isLight ? 'login-light-input bg-white text-slate-900 placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500' : 'placeholder:text-slate-500 disabled:border-slate-800 disabled:bg-slate-950/70 disabled:text-slate-500'} ${error ? 'border-red-500 hover:border-red-400 focus:border-red-500 focus:ring-red-500/20' : isLight ? 'border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-blue-500/25' : 'border-slate-700 hover:border-slate-500 focus:border-blue-500 focus:ring-blue-500/30'} ${leadingIcon ? 'pl-10' : 'pl-3.5'}`}
          style={isLight ? undefined : {
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
            className={`absolute right-1.5 top-1/2 inline-flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${name}-error`} className={`mt-1 text-xs ${isLight ? 'text-red-600' : 'text-red-400'}`}>{error}</p>
      )}
    </div>
  );
};

export default FormInput;
