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
        <input
          id={name}
          type={inputType}
          name={name}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="appearance-none rounded-lg relative block w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all duration-200"
          style={{
            backgroundColor: '#091018',
            border: `1px solid ${error ? '#EF4444' : '#2A3447'}`,
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A2AAB8] hover:text-[#F5F7FA] transition-colors"
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
