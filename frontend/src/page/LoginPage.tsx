import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import GoogleIcon from '../components/auth/GoogleIcon';
import type { AuthMode } from '../types';

const getTitle = (mode: AuthMode): string => (mode === 'login' ? 'FORM LOGIN' : 'FORM SIGNUP');

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    mode,
    formData,
    errors,
    isSubmitting,
    toggleMode,
    updateField,
    handleSubmit,
    handleCancel,
  } = useAuthForm({
    initialMode: 'login',
    onLogin: () => navigate('/dashboard'),
    onSignup: () => navigate('/dashboard'),
  });

  return (
    <AuthLayout>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-wide" style={{ color: '#F5F7FA' }}>
          {getTitle(mode)}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <FormInput
            label="Full Name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Enter your full name"
            value={formData.name}
            onChange={(value) => updateField('name', value)}
            error={errors.name}
            required
          />
        )}

        <FormInput
          label={mode === 'login' ? 'User Name' : 'Email Address'}
          type={mode === 'login' ? 'text' : 'email'}
          name="email"
          autoComplete={mode === 'login' ? 'username' : 'email'}
          placeholder={mode === 'login' ? 'Enter your username' : 'Enter your email'}
          value={formData.email}
          onChange={(value) => updateField('email', value)}
          error={errors.email}
          required
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="Enter your password"
          value={formData.password}
          onChange={(value) => updateField('password', value)}
          error={errors.password}
          required
          showPasswordToggle
        />

        {mode === 'signup' && (
          <FormInput
            label="Confirm Password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={(value) => updateField('confirmPassword', value)}
            error={errors.confirmPassword}
            required
            showPasswordToggle
          />
        )}

        {mode === 'login' && (
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="rememberMe"
                checked={formData.rememberMe}
                onChange={(e) => updateField('rememberMe', e.target.checked)}
                className="w-4 h-4 rounded border-2 focus:ring-2 focus:ring-offset-0 transition-colors"
                style={{
                  backgroundColor: '#091018',
                  borderColor: '#2A3447',
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
              className="text-sm hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer font-medium"
              style={{ color: '#5B8CFF' }}
            >
              Forgot Password?
            </button>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {mode === 'login' ? (
            <>
              <FormButton type="submit" variant="primary" isLoading={isSubmitting}>
                LOGIN
              </FormButton>
              <FormButton type="button" variant="secondary" onClick={handleCancel}>
                CANCEL
              </FormButton>
            </>
          ) : (
            <FormButton type="submit" variant="primary" isLoading={isSubmitting}>
              SIGN UP
            </FormButton>
          )}
        </div>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm" style={{ color: '#A2AAB8' }}>
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={toggleMode}
                style={{ color: '#5B8CFF' }}
                className="hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer font-medium"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={toggleMode}
                style={{ color: '#5B8CFF' }}
                className="hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer font-medium"
              >
                Login
              </button>
            </>
          )}
        </p>
      </div>

      {mode === 'signup' && (
        <>
          <div className="relative mt-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: '#2A3447' }} />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2" style={{ backgroundColor: '#121B2A', color: '#A2AAB8' }}>
                OR
              </span>
            </div>
          </div>

          <div className="mt-6">
            <FormButton type="button" variant="google" onClick={() => {}}>
              <GoogleIcon />
              Continue with Google
            </FormButton>
          </div>
        </>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
