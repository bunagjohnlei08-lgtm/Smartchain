import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';
import api from '../lib/api';
import type { AxiosError } from 'axios';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    formData,
    errors,
    isSubmitting,
    updateField,
    handleSubmit,
    handleCancel,
  } = useAuthForm({
    initialMode: 'login',
    onLogin: async (data) => {
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
            apiErrors.email = String(data.message);
          }
        }
        updateField('email', data.email);
        updateField('password', data.password);
        setLoginErrors(apiErrors);
      }
    },
  });

  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  return (
    <AuthLayout>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-wide" style={{ color: '#F5F7FA' }}>
          FORM LOGIN
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {loginErrors.email && (
          <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#FCA5A5', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {loginErrors.email}
          </div>
        )}

        <FormInput
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          placeholder="Enter your email"
          value={formData.email}
          onChange={(value) => updateField('email', value)}
          error={errors.email || loginErrors.email}
          required
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={(value) => updateField('password', value)}
          error={errors.password || loginErrors.password}
          required
          showPasswordToggle
        />

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

        <div className="mt-6 space-y-3">
          <FormButton type="submit" variant="primary" isLoading={isSubmitting}>
            LOGIN
          </FormButton>
          <FormButton type="button" variant="secondary" onClick={handleCancel}>
            CANCEL
          </FormButton>
        </div>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
