import React, { useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { ArrowLeft, RotateCw, ShieldCheck } from 'lucide-react';
import FormButton from './FormButton';
import api from '../../lib/api';

export interface VerifiedLogin {
  token: string;
  user: { role?: { slug?: string } | null } & Record<string, unknown>;
  is_first_login?: boolean;
}

interface OtpVerificationFormProps {
  challengeId: string;
  email: string;
  initialResendIn: number;
  expiresIn: number;
  onVerified: (result: VerifiedLogin) => void;
  onBack: () => void;
  appearance?: 'dark' | 'light';
}

type OtpErrorResponse = {
  message?: string;
  reason?: string;
  retry_after?: number;
  errors?: Record<string, string[]>;
};

// Reasons after which this challenge can never succeed; the user must sign in again.
const TERMINAL_REASONS = new Set(['attempts_exhausted', 'challenge_invalid', 'already_used', 'resend_limit', 'delivery_failed']);

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
};

/**
 * Second sign-in step. The code lives only in this component's state: it is
 * never written to storage, the URL, or cookies, and no auth data is stored
 * until the verify endpoint returns a token.
 */
const OtpVerificationForm: React.FC<OtpVerificationFormProps> = ({
  challengeId,
  email,
  initialResendIn,
  expiresIn,
  onVerified,
  onBack,
  appearance = 'dark',
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isTerminal, setIsTerminal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendIn, setResendIn] = useState(initialResendIn);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const describeError = (err: unknown, fallback: string): string => {
    const axiosError = err as AxiosError<OtpErrorResponse>;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;

    if (data?.reason && TERMINAL_REASONS.has(data.reason)) setIsTerminal(true);
    if (data?.reason === 'cooldown' && typeof data.retry_after === 'number') setResendIn(data.retry_after);

    switch (data?.reason) {
      case 'invalid_code':
        return 'The verification code is incorrect. Please try again.';
      case 'expired':
        return 'This code has expired. Request a new code to continue.';
      case 'attempts_exhausted':
        return 'Too many incorrect codes. Please go back and sign in again.';
      case 'challenge_invalid':
        return 'This verification session has ended. Please go back and sign in again.';
      case 'already_used':
        return 'This code has already been used. Please go back and sign in again.';
      case 'resend_limit':
        return 'No more codes can be sent for this sign-in. Please go back and sign in again.';
      case 'delivery_failed':
        return 'We could not send a new code. Please go back and sign in again.';
      case 'cooldown':
        return 'Please wait before requesting another code.';
      default:
        break;
    }

    if (data?.errors?.otp) return 'Enter the 6-digit code from your email.';
    if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
    return fallback;
  };

  const handleCodeChange = (value: string) => {
    // Digits only, so pasted text such as "123 456" or "Code: 123456" still works.
    setCode(value.replace(/\D/g, '').slice(0, 6));
    setError('');
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || isTerminal) return;

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    inFlight.current = true;
    setIsVerifying(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/api/login/verify-otp', { challenge_id: challengeId, otp: code });
      onVerified(response.data as VerifiedLogin);
    } catch (err) {
      setCode('');
      setError(describeError(err, 'Unable to verify the code. Please try again.'));
      inputRef.current?.focus();
    } finally {
      inFlight.current = false;
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (inFlight.current || isTerminal || resendIn > 0) return;

    inFlight.current = true;
    setIsResending(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/api/login/resend-otp', { challenge_id: challengeId });
      setCode('');
      setResendIn(Number(response.data?.resend_available_in) || 60);
      setNotice('A new code has been sent. Earlier codes no longer work.');
      inputRef.current?.focus();
    } catch (err) {
      setError(describeError(err, 'Unable to send a new code. Please try again.'));
    } finally {
      inFlight.current = false;
      setIsResending(false);
    }
  };

  const busy = isVerifying || isResending;
  const isLight = appearance === 'light';

  return (
    <>
      <div className="mb-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/10 bg-blue-500/10 text-blue-400 shadow-[0_0_24px_rgba(37,99,235,0.12)]">
          <ShieldCheck className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h2 className={`mt-4 text-2xl font-bold tracking-tight md:text-[1.625rem] lg:text-[1.75rem] xl:text-[1.875rem] ${isLight ? 'text-slate-900' : 'text-white'}`}>
          Verify your identity
        </h2>
        <p className={`mt-2 text-sm md:text-[15px] xl:text-base ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          We sent a 6-digit verification code to{' '}
          <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{maskEmail(email)}</span>.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-[18px]" noValidate>
        {notice && !error && (
          <div role="status" aria-live="polite" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" aria-live="polite" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="otp" className={`mb-1.5 block text-sm font-medium ${isLight ? 'text-slate-700' : 'text-[#A2AAB8]'}`}>
            Verification code <span className="text-[#EF4444]">*</span>
          </label>
          <input
            ref={inputRef}
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            disabled={busy || isTerminal}
            aria-invalid={!!error}
            className={`block min-h-14 w-full appearance-none rounded-xl border px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${isLight ? 'border-slate-300 placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-blue-500/25' : 'border-slate-700 placeholder:text-slate-600 hover:border-slate-500 focus:border-blue-500 focus:ring-blue-500/30'}`}
            style={{ backgroundColor: isLight ? '#FFFFFF' : '#050e1b', color: isLight ? '#0F172A' : '#F5F7FA' }}
          />
          <p className={`mt-1.5 text-xs ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
            The code expires in {Math.ceil(expiresIn / 60)} minutes. Never share it with anyone.
          </p>
        </div>

        <FormButton type="submit" variant="primary" isLoading={isVerifying} disabled={busy || isTerminal || code.length !== 6}>
          {!isVerifying && <ShieldCheck className="h-5 w-5" />}
          {isVerifying ? 'Verifying...' : 'Verify'}
        </FormButton>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || isTerminal || resendIn > 0}
            aria-live="polite"
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:text-slate-500 ${isLight ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}
          >
            <RotateCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        </div>
      </form>
    </>
  );
};

export default OtpVerificationForm;
