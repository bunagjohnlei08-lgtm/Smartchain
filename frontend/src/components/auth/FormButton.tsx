 import React from 'react';

export type FormButtonVariant = 'primary' | 'secondary' | 'google';

export interface FormButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: FormButtonVariant;
  isLoading?: boolean;
  disabled?: boolean;
}

const spinner = (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const FormButton: React.FC<FormButtonProps> = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  isLoading = false,
  disabled = false,
}) => {
  const baseClasses = 'w-full flex justify-center py-3 px-4 border text-sm font-medium rounded-lg transition-all duration-200 min-h-[44px]';

  const variantClasses: Record<FormButtonVariant, string> = {
    primary: 'border-transparent hover:opacity-90 hover:shadow-lg',
    secondary: 'hover:opacity-80',
    google: 'inline-flex items-center gap-2 hover:opacity-80',
  };

  const styleMap: Record<FormButtonVariant, React.CSSProperties> = {
    primary: { backgroundColor: '#5B8CFF', color: '#F5F7FA' },
    secondary: { backgroundColor: 'transparent', borderColor: '#2A3447', color: '#A2AAB8' },
    google: { backgroundColor: '#091018', borderColor: '#2A3447', color: '#F5F7FA' },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]}`}
      style={styleMap[variant]}
    >
      {isLoading && spinner}
      {children}
    </button>
  );
};

export default FormButton;
