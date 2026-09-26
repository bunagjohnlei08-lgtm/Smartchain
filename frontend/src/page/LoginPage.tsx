import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import OtpVerificationForm, { type VerifiedLogin } from '../components/auth/OtpVerificationForm';
import api from '../lib/api';
import { FIRST_LOGIN_STORAGE_KEY } from '../lib/greeting';
import type { AxiosError } from 'axios';
import { Lock, LockKeyhole, LogIn, Mail } from 'lucide-react';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Success notice handed over by the account activation page.
  const stateNotice = (location.state as { notice?: string } | null)?.notice;
  const idleNotice = new URLSearchParams(location.search).get('reason') === 'session-expired'
    ? 'Your session expired due to inactivity. Please sign in again.'
    : undefined;
  const notice = idleNotice ?? stateNotice;
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // Pending second step. Held in component state only - never stored or put in the URL.
  const [challenge, setChallenge] = useState<{ id: string; email: string; resendIn: number } | null>(null);
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
        const response = await api.post('/api/login', {
          email: data.email,
          password: data.password,
        });

        // A correct password only starts the emailed-code step; nothing is
        // stored and no navigation happens until the code is verified.
        if (response.data?.requires_otp && typeof response.data.challenge_id === 'string') {
          updateField('password', '');
          setLoginErrors({});
          setChallenge({
            id: response.data.challenge_id,
            email: data.email.trim(),
            resendIn: Number(response.data.resend_available_in) || 60,
          });
          return;
        }

        setLoginErrors({ form: 'Unable to sign in. Please try again.' });
      } catch (error) {
        const apiErrors: Record<string, string> = {};
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        if (axiosError.response?.data && typeof axiosError.response.data === 'object') {
          const data = axiosError.response.data as Record<string, unknown>;
          if ((status === 429 || status === 503) && typeof data.message === 'string') {
            apiErrors.form = data.message;
          } else if (data.errors && typeof data.errors === 'object') {
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

  const completeLogin = ({ token, user, is_first_login }: VerifiedLogin) => {
    sessionStorage.setItem('isAuthenticated', 'true');
    sessionStorage.setItem('userRole', user.role?.slug || '');
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem(FIRST_LOGIN_STORAGE_KEY, String(is_first_login === true));
    setChallenge(null);

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
  };

  if (challenge) {
    return (
      <AuthLayout>
        <OtpVerificationForm
          key={challenge.id}
          challengeId={challenge.id}
          email={challenge.email}
          initialResendIn={challenge.resendIn}
          onVerified={completeLogin}
          onBack={() => {
            setChallenge(null);
            setLoginErrors({});
          }}
        />
      </AuthLayout>
    );
  }

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
      <div className="mb-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.18)] lg:h-11 lg:w-11">
          <LockKeyhole className="h-[18px] w-[18px] lg:h-5 lg:w-5" strokeWidth={1.8} />
        </div>
        <h2 className="mt-2.5 text-lg font-bold tracking-tight text-white sm:text-xl lg:text-[22px] xl:text-2xl">
          Sign in to <span className="text-sky-400">SmartChain</span>
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-slate-400 lg:text-xs">
          Welcome back! Please enter your credentials.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-[90%] space-y-3 sm:w-full">
        {notice && !loginErrors.form && (
          <div role="status" aria-live="polite" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-300 lg:text-xs">
            {notice}
          </div>
        )}
        {loginErrors.form && (
          <div role="alert" aria-live="polite" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-300 lg:text-xs">
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
          leadingIcon={<Mail className="h-4 w-4" />}
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
          leadingIcon={<Lock className="h-4 w-4" />}
          disabled={isLoginBusy}
        />

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <label className="group flex min-h-11 cursor-pointer items-center rounded-lg focus-within:ring-2 focus-within:ring-blue-500/40">
            <input
              type="checkbox"
              id="rememberMe"
              checked={formData.rememberMe}
              onChange={(e) => updateField('rememberMe', e.target.checked)}
              disabled={isLoginBusy}
              className="h-3.5 w-3.5 cursor-pointer rounded border-2 border-slate-700 bg-[#091018] accent-blue-500 transition-colors group-hover:border-blue-400 focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-0 checked:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:h-4 sm:w-4"
              style={{
                accentColor: '#5B8CFF',
              }}
            />
            <span className="ml-2 text-[11px] sm:text-xs" style={{ color: '#A2AAB8' }}>
              Remember me
            </span>
          </label>
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="min-h-11 rounded-lg border-none bg-transparent px-1 text-[11px] font-medium text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:text-xs"
          >
            Forgot Password?
          </button>
        </div>

        <div className="mx-auto w-1/2 pt-1 [&>button]:!min-h-[37px] [&>button]:!gap-1.5 [&>button]:!rounded-[10px] [&>button]:!px-3 [&>button]:!py-0 [&>button]:!text-xs [&>button]:!font-medium sm:w-full sm:[&>button]:!min-h-[42px] sm:[&>button]:!gap-2 sm:[&>button]:!rounded-xl sm:[&>button]:!px-4 sm:[&>button]:!py-2.5 sm:[&>button]:!text-[13px] sm:[&>button]:!font-semibold">
          <FormButton type="submit" variant="primary" isLoading={isLoginBusy} disabled={isLoginBusy}>
            {!isLoginBusy && <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            {isLoginBusy ? 'Signing in...' : 'Sign In'}
          </FormButton>
        </div>
      </form>

      <footer className="mt-4 border-t border-slate-700/50 pt-3 text-center text-[10px] leading-4 text-slate-500 lg:mt-5 lg:pt-4">
        <p>&copy; 2026 Archon Nell Incorporated. All rights reserved.</p>
      </footer>
    </AuthLayout>
  );
};

export default LoginPage;
