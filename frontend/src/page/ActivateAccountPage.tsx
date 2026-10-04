import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { AlertTriangle, CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import PasswordRequirements from '../components/auth/PasswordRequirements';
import api from '../lib/api';
import { isPasswordValid, PASSWORD_MAX_LENGTH, passwordValidationMessage } from '../lib/passwordPolicy';

type PageState = 'validating' | 'valid' | 'invalid' | 'activated';

interface Invitation {
  name: string;
  email: string;
  expires_at: string;
}

const ACTIVATED_MESSAGE = 'Your account has been activated. You can now sign in.';
const INVALID_MESSAGE = 'This invitation link is invalid or has expired. Please ask your administrator for a new invitation.';

/**
 * Public page behind the emailed activation link. The token is read from the
 * URL into component state only: it is never stored, logged, or sent anywhere
 * but the invitation endpoints. Activation does not sign the user in.
 */
const ActivateAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [state, setState] = useState<PageState>(token ? 'validating' : 'invalid');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validatedRef = useRef(false);

  useEffect(() => {
    // Guard against the React StrictMode double effect spending rate limit.
    if (!token || validatedRef.current) return;
    validatedRef.current = true;

    api.post('/api/invitations/validate', { token })
      .then((response) => {
        setInvitation(response.data as Invitation);
        setState('valid');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const clientErrors = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const passwordError = passwordValidationMessage(password);
    if (passwordError) next.password = passwordError;
    if (confirmation !== password) next.password_confirmation = 'Password confirmation does not match.';
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validation = clientErrors();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setIsSubmitting(true);
    try {
      await api.post('/api/invitations/accept', {
        token,
        password,
        password_confirmation: confirmation,
      });
      setPassword('');
      setConfirmation('');
      setState('activated');
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string; valid?: boolean; errors?: Record<string, string[]> }>;
      const data = axiosError.response?.data;
      if (data?.valid === false) {
        setState('invalid');
      } else if (data?.errors) {
        const mapped: Record<string, string> = {};
        Object.entries(data.errors).forEach(([key, messages]) => {
          mapped[key] = Array.isArray(messages) ? String(messages[0]) : String(messages);
        });
        setErrors(mapped);
      } else if (axiosError.response?.status === 429) {
        setErrors({ form: 'Too many attempts. Please wait a minute and try again.' });
      } else {
        setErrors({ form: 'Unable to activate your account. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Replace history so the token-bearing URL is not kept as a back entry.
  const goToLogin = () => navigate('/login', { replace: true, state: { notice: ACTIVATED_MESSAGE } });

  return (
    <AuthLayout>
      <div className="mb-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/10 bg-blue-500/10 text-blue-400 shadow-[0_0_24px_rgba(37,99,235,0.12)]">
          {state === 'activated' ? <CheckCircle2 className="h-8 w-8" strokeWidth={1.8} />
            : state === 'invalid' ? <AlertTriangle className="h-8 w-8" strokeWidth={1.8} />
            : <ShieldCheck className="h-8 w-8" strokeWidth={1.8} />}
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white md:text-[1.625rem] lg:text-[1.75rem]">
          {state === 'activated' ? 'Account activated' : <>Activate your <span className="text-blue-500">SmartChain</span> account</>}
        </h2>
      </div>

      {state === 'validating' && (
        <p role="status" aria-live="polite" className="text-center text-sm text-slate-400">Checking your invitation...</p>
      )}

      {state === 'invalid' && (
        <div className="space-y-5">
          <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {INVALID_MESSAGE}
          </div>
          <Link
            to="/login"
            replace
            className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            Back to Sign In
          </Link>
        </div>
      )}

      {state === 'activated' && (
        <div className="space-y-5">
          <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {ACTIVATED_MESSAGE}
          </div>
          <FormButton type="button" variant="primary" onClick={goToLogin}>
            Go to Sign In
          </FormButton>
        </div>
      )}

      {state === 'valid' && invitation && (
        <form onSubmit={handleSubmit} className="space-y-[18px]" noValidate>
          <p className="text-center text-sm text-slate-400">
            Welcome, <span className="font-medium text-slate-200">{invitation.name}</span>. Create a password for{' '}
            <span className="break-all font-medium text-slate-200">{invitation.email}</span>.
          </p>

          {errors.form && (
            <div role="alert" aria-live="polite" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {errors.form}
            </div>
          )}

          <FormInput
            label="New Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={password}
            onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: '', form: '' })); }}
            error={errors.password}
            required
            showPasswordToggle
            leadingIcon={<Lock className="h-5 w-5" />}
            disabled={isSubmitting}
            maxLength={PASSWORD_MAX_LENGTH}
          />

          <PasswordRequirements password={password} />

          <FormInput
            label="Confirm Password"
            type="password"
            name="password_confirmation"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirmation}
            onChange={(value) => { setConfirmation(value); setErrors((current) => ({ ...current, password_confirmation: '', form: '' })); }}
            error={errors.password_confirmation}
            required
            showPasswordToggle
            leadingIcon={<KeyRound className="h-5 w-5" />}
            disabled={isSubmitting}
            maxLength={PASSWORD_MAX_LENGTH}
          />

          <p className="text-xs text-slate-500">
            This link expires {new Date(invitation.expires_at).toLocaleString()}.
          </p>

          <div className="pt-2">
            <FormButton
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={isSubmitting || !isPasswordValid(password) || confirmation !== password}
            >
              {!isSubmitting && <ShieldCheck className="h-5 w-5" />}
              {isSubmitting ? 'Activating...' : 'Activate Account'}
            </FormButton>
          </div>
        </form>
      )}

      <footer className="mt-6 border-t border-slate-700/60 pt-4 text-center text-sm leading-6 text-slate-500">
        <p>&copy; 2026 Archon Nell Incorporated</p>
        <p>All rights reserved.</p>
      </footer>
    </AuthLayout>
  );
};

export default ActivateAccountPage;
