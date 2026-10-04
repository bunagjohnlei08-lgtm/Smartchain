import React, { useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { ArrowLeft, KeyRound, Mail, RotateCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import PasswordRequirements from '../components/auth/PasswordRequirements';
import api from '../lib/api';
import { isPasswordValid, PASSWORD_MAX_LENGTH, passwordValidationMessage } from '../lib/passwordPolicy';

type Step = 'email' | 'otp' | 'password' | 'success';
type ApiError = { message?: string; reason?: string; retry_after?: number; errors?: Record<string, string[]> };

const GENERIC_NOTICE = 'If an account exists, a verification code has been sent to the registered email.';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [flowId, setFlowId] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const messageFor = (err: unknown, fallback: string) => {
    const response = (err as AxiosError<ApiError>).response?.data;
    if (response?.reason === 'cooldown' && typeof response.retry_after === 'number') setResendIn(response.retry_after);
    return response?.message || response?.errors?.password?.[0] || response?.errors?.email?.[0] || fallback;
  };

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await action(); } finally { inFlight.current = false; setBusy(false); }
  };

  const requestCode = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      try {
        const response = await api.post('/api/forgot-password', { email });
        setFlowId(String(response.data.flow_id));
        setResendIn(Number(response.data.resend_available_in) || 60);
        setNotice(response.data.message || GENERIC_NOTICE);
        setStep('otp');
      } catch (err) { setError(messageFor(err, 'Unable to start password reset. Please try again.')); }
    });
  };

  const verifyCode = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your email.'); return; }
    void run(async () => {
      try {
        const response = await api.post('/api/forgot-password/verify', { flow_id: flowId, otp: code });
        setResetToken(String(response.data.reset_token));
        setCode('');
        setNotice('Email verified. Create a new password.');
        setStep('password');
      } catch (err) { setCode(''); setError(messageFor(err, 'Unable to verify the code.')); }
    });
  };

  const resend = () => void run(async () => {
    try {
      const response = await api.post('/api/forgot-password/resend', { flow_id: flowId });
      setCode('');
      setResendIn(Number(response.data.resend_available_in) || 60);
      setNotice('A new code has been sent. Earlier codes no longer work.');
    } catch (err) { setError(messageFor(err, 'Unable to resend the code.')); }
  });

  const resetPassword = (event: React.FormEvent) => {
    event.preventDefault();
    const passwordError = passwordValidationMessage(password);
    if (passwordError) { setError(passwordError); return; }
    if (password !== confirmation) { setError('Password confirmation does not match.'); return; }
    void run(async () => {
      try {
        await api.post('/api/forgot-password/reset', {
          reset_token: resetToken,
          password,
          password_confirmation: confirmation,
        });
        setResetToken('');
        setPassword('');
        setConfirmation('');
        setNotice('Password reset successfully.');
        setStep('success');
      } catch (err) { setError(messageFor(err, 'Unable to reset your password.')); }
    });
  };

  const back = () => navigate('/login');

  return (
    <AuthLayout>
      <div className="mb-4 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-400">
          {step === 'otp' ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </div>
        <h2 className="mt-3 text-xl font-bold text-white sm:text-2xl">
          {step === 'email' && 'Forgot Password'}
          {step === 'otp' && 'Enter Verification Code'}
          {step === 'password' && 'Create New Password'}
          {step === 'success' && 'Password Reset Successful'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {step === 'email' && 'Enter the email associated with your SmartChain account.'}
          {step === 'otp' && 'We sent a 6-digit verification code to your registered email.'}
          {step === 'password' && 'Choose a password that meets every requirement below.'}
          {step === 'success' && 'You can now sign in using your new password.'}
        </p>
      </div>

      {notice && <div role="status" className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      {step === 'email' && <form onSubmit={requestCode} className="space-y-4">
        <FormInput label="Email Address" type="email" name="reset-email" autoComplete="email" value={email} onChange={(value) => { setEmail(value); setError(''); }} required disabled={busy} leadingIcon={<Mail className="h-4 w-4" />} />
        <FormButton type="submit" isLoading={busy} disabled={busy}>Send Verification Code</FormButton>
      </form>}

      {step === 'otp' && <form onSubmit={verifyCode} className="space-y-4">
        <input aria-label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} disabled={busy} className="min-h-14 w-full rounded-xl border border-slate-700 bg-[#050e1b] px-4 text-center font-mono text-2xl tracking-[0.45em] text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="000000" />
        <FormButton type="submit" isLoading={busy} disabled={busy || code.length !== 6}>Verify Code</FormButton>
        <button type="button" onClick={resend} disabled={busy || resendIn > 0} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-blue-400 disabled:text-slate-500"><RotateCw className="h-4 w-4" />{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend Code'}</button>
      </form>}

      {step === 'password' && <form onSubmit={resetPassword} className="space-y-3">
        <FormInput label="New Password" type="password" name="new-password" autoComplete="new-password" value={password} onChange={(value) => { setPassword(value); setError(''); }} required showPasswordToggle disabled={busy} maxLength={PASSWORD_MAX_LENGTH} />
        <PasswordRequirements password={password} />
        <FormInput label="Confirm Password" type="password" name="confirm-password" autoComplete="new-password" value={confirmation} onChange={(value) => { setConfirmation(value); setError(''); }} required showPasswordToggle disabled={busy} maxLength={PASSWORD_MAX_LENGTH} />
        <FormButton type="submit" isLoading={busy} disabled={busy || !isPasswordValid(password) || confirmation !== password}>Reset Password</FormButton>
      </form>}

      {step === 'success' && <FormButton type="button" onClick={back}>Back to Sign In</FormButton>}

      {step !== 'success' && <button type="button" onClick={back} disabled={busy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white disabled:opacity-60"><ArrowLeft className="h-4 w-4" />Back to Sign In</button>}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
