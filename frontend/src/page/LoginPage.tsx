import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import api from '../lib/api';
import type { AxiosError } from 'axios';
import { Lock, LockKeyhole, LogIn, Mail } from 'lucide-react';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const {
    formData,
    errors,
    isSubmitting,
    updateField,
    handleSubmit,
  } = useAuthForm({
    initialMode: 'login',
    onLogin: async (data) => {
      setIsAuthenticating(true);
      try {
        await api.get('/sanctum/csrf-cookie', { withCredentials: true });

        const response = await api.post('/api/login', {
          email: data.email,
          password: data.password,
        });

        const { token, user } = response.data;
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('userRole', user.role?.slug || '');
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(user));

        const role = user.role?.slug;
        if (role === 'ADMIN') {
          navigate('/admin/dashboard');
        } else if (role === 'QA_SUPERVISOR') {
          navigate('/qa/dashboard');
        } else if (role === 'PLANT_MANAGER') {
          navigate('/plant-manager/dashboard');
        } else {
          navigate('/login');
        }
      } catch (error) {
        const apiErrors: Record<string, string> = {};
        const axiosError = error as AxiosError;
        if (axiosError.response?.data && typeof axiosError.response.data === 'object') {
          const data = axiosError.response.data as Record<string, unknown>;
          if (data.errors && typeof data.errors === 'object') {
            Object.entries(data.errors as Record<string, unknown>).forEach(([key, messages]) => {
              apiErrors[key] = Array.isArray(messages) ? String(messages[0]) : String(messages);
            });
          } else if (data.message) {
            apiErrors.form = 'Invalid email or password.';
          }
        }
        if (Object.keys(apiErrors).length === 0) {
          apiErrors.form = 'Unable to sign in. Please try again.';
        }
        updateField('email', data.email);
        updateField('password', data.password);
        setLoginErrors(apiErrors);
      } finally {
        setIsAuthenticating(false);
      }
    },
  });

  const isLoginBusy = isSubmitting || isAuthenticating;

  const updateLoginField = (field: 'email' | 'password', value: string) => {
    updateField(field, value);
    setLoginErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  };

  return (
    <AuthLayout>
      <div className="mb-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/10 bg-blue-500/10 text-blue-400 shadow-[0_0_24px_rgba(37,99,235,0.12)]">
          <LockKeyhole className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white md:text-[1.625rem] lg:text-[1.75rem] xl:text-[1.875rem]">
          Sign in to <span className="text-blue-500">SmartChain</span>
        </h2>
        <p className="mt-2 text-sm text-slate-400 md:text-[15px] xl:text-base">
          Welcome back! Please enter your credentials.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-[18px]">
        {loginErrors.form && (
          <div role="alert" aria-live="polite" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {loginErrors.form}
          </div>
        )}

        <FormInput
          label="Email Address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={formData.email}
          onChange={(value) => updateLoginField('email', value)}
          error={errors.email || loginErrors.email}
          required
          leadingIcon={<Mail className="h-5 w-5" />}
          disabled={isLoginBusy}
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={(value) => updateLoginField('password', value)}
          error={errors.password || loginErrors.password}
          required
          showPasswordToggle
          leadingIcon={<Lock className="h-5 w-5" />}
          disabled={isLoginBusy}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="group flex min-h-11 cursor-pointer items-center rounded-lg focus-within:ring-2 focus-within:ring-blue-500/40">
            <input
              type="checkbox"
              id="rememberMe"
              checked={formData.rememberMe}
              onChange={(e) => updateField('rememberMe', e.target.checked)}
              disabled={isLoginBusy}
              className="h-5 w-5 cursor-pointer rounded border-2 border-slate-700 bg-[#091018] accent-blue-500 transition-colors group-hover:border-blue-400 focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0 checked:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                accentColor: '#5B8CFF',
              }}
            />
            <span className="ml-2 text-sm" style={{ color: '#A2AAB8' }}>
              Remember me
            </span>
          </label>
          <button
            type="button"
            onClick={() => {}}
            className="min-h-11 rounded-lg border-none bg-transparent px-1 text-sm font-medium text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            Forgot Password?
          </button>
        </div>

        <div className="pt-3">
          <FormButton type="submit" variant="primary" isLoading={isLoginBusy} disabled={isLoginBusy}>
            {!isLoginBusy && <LogIn className="h-5 w-5" />}
            {isLoginBusy ? 'Signing in...' : 'Sign In'}
          </FormButton>
        </div>
      </form>

      <footer className="mt-6 border-t border-slate-700/60 pt-4 text-center text-sm leading-6 text-slate-500">
        <p>&copy; 2026 Archon Nell Incorporated</p>
        <p>All rights reserved.</p>
      </footer>
    </AuthLayout>
  );
};

export default LoginPage;
