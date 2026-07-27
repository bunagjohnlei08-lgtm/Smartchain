import { useReducer, useCallback, useState } from 'react';
import type { AuthMode, LoginFormData, SignupFormData } from '../types';

export type FieldErrors = Partial<Record<string, string>>;

type FormState = {
  mode: AuthMode;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  rememberMe: boolean;
};

type Action =
  | { type: 'SET_FIELD'; field: keyof FormState; value: string | boolean }
  | { type: 'SET_MODE'; mode: AuthMode }
  | { type: 'RESET' };

const getInitialState = (mode: AuthMode): FormState => {
  if (mode === 'login') {
    return { mode: 'login', name: '', email: '', password: '', confirmPassword: '', rememberMe: false };
  }
  return { mode: 'signup', name: '', email: '', password: '', confirmPassword: '', rememberMe: false };
};

const validate = (state: FormState): FieldErrors => {
  const errors: FieldErrors = {};
  if (!state.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(state.email)) {
    errors.email = 'Invalid email format';
  }
  if (!state.password) {
    errors.password = 'Password is required';
  } else if (state.password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }
  if (state.mode === 'signup') {
    if (!state.name.trim()) {
      errors.name = 'Name is required';
    }
    if (state.password !== state.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
  }
  return errors;
};

const reducer = (state: FormState, action: Action): FormState => {
  switch (action.type) {
    case 'SET_FIELD': {
      return { ...state, [action.field]: action.value };
    }
    case 'SET_MODE': {
      return getInitialState(action.mode);
    }
    case 'RESET': {
      return getInitialState(state.mode);
    }
    default:
      return state;
  }
};

export interface UseAuthFormOptions {
  onLogin?: (data: LoginFormData) => void;
  onSignup?: (data: SignupFormData) => void;
  initialMode?: AuthMode;
}

export interface UseAuthFormResult {
  mode: AuthMode;
  formData: FormState;
  errors: FieldErrors;
  isSubmitting: boolean;
  toggleMode: () => void;
  updateField: (field: keyof FormState, value: string | boolean) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleCancel: () => void;
};

export const useAuthForm = ({
  onLogin,
  onSignup,
  initialMode = 'login',
}: UseAuthFormOptions = {}): UseAuthFormResult => {
  const [state, dispatch] = useReducer(reducer, undefined, () => getInitialState(initialMode));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback((field: keyof FormState, value: string | boolean) => {
    dispatch({ type: 'SET_FIELD', field, value });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const toggleMode = useCallback(() => {
    dispatch({ type: 'SET_MODE', mode: state.mode === 'login' ? 'signup' : 'login' });
    setErrors({});
  }, [state.mode]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'RESET' });
    setErrors({});
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validate(state);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        if (state.mode === 'login' && onLogin) {
          onLogin({
            mode: 'login',
            email: state.email,
            password: state.password,
            rememberMe: state.rememberMe,
          });
        } else if (state.mode === 'signup' && onSignup) {
          onSignup({
            mode: 'signup',
            name: state.name,
            email: state.email,
            password: state.password,
            confirmPassword: state.confirmPassword,
          });
        }
      }, 1000);
    },
    [state, onLogin, onSignup]
  );

  return {
    mode: state.mode,
    formData: state,
    errors,
    isSubmitting,
    toggleMode,
    updateField,
    handleSubmit,
    handleCancel,
  };
};