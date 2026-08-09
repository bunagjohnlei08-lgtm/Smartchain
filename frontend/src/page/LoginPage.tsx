import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthLayout } from '../components/auth';
import FormButton from '../components/auth/FormButton';
import FormInput from '../components/auth/FormInput';

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
    onLogin: (data) => {
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userRole', data.role);
      if (data.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (data.role === 'qa_supervisor') {
        navigate('/qa/dashboard');
      } else {
        navigate('/plant-manager/dashboard');
      }
    },
  });

  return (
    <AuthLayout>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-wide" style={{ color: '#F5F7FA' }}>
          FORM LOGIN
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="User Name"
          type="text"
          name="email"
          autoComplete="username"
          placeholder="Enter your username"
          value={formData.email}
          onChange={(value) => updateField('email', value)}
          error={errors.email}
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
          error={errors.password}
          required
          showPasswordToggle
        />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium" style={{ color: '#A2AAB8' }}>
            Role
          </label>
          <select
            value={formData.role}
            onChange={(e) => updateField('role', e.target.value)}
            className="w-full bg-[#091018] border border-[#2A3447] rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            style={{ color: '#F5F7FA' }}
          >
            <option value="" disabled>
              Select a role
            </option>
            <option value="admin">Admin</option>
            <option value="plant_manager">Plant Manager</option>
            <option value="qa_supervisor">QA/QC Supervisor</option>
          </select>
          {errors.role && <p className="text-xs text-red-400">{errors.role}</p>}
        </div>

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
