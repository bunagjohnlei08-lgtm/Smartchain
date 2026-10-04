import axios from 'axios';
import { clearAuthStorage, redirectToPublicLanding, SESSION_IDLE_TIMEOUT_EVENT } from './authSession';

// Local development falls back to the Laravel dev server.
// Railway (and any other deployed environment) supplies VITE_API_URL at build time.
const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Authentication is Sanctum personal access tokens (Bearer), not the cookie/session
// SPA flow, so neither client sends credentials or an XSRF header. That keeps the
// browser from attempting cross-domain cookie auth between the separate frontend
// and backend deployments.
const defaultHeaders = {
  Accept: 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: defaultHeaders,
});

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: defaultHeaders,
});

const attachAuth = (config: any) => {
  const token = sessionStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
};

api.interceptors.request.use(attachAuth);
apiClient.interceptors.request.use(attachAuth);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthenticatedSession = sessionStorage.getItem('isAuthenticated') === 'true'
      || Boolean(sessionStorage.getItem('token'));

    if (error?.response?.status === 401 && isAuthenticatedSession) {
      if (error.response?.data?.code !== 'SESSION_IDLE_TIMEOUT') {
        redirectToPublicLanding();
        return Promise.reject(error);
      }

      clearAuthStorage();
      window.dispatchEvent(new Event(SESSION_IDLE_TIMEOUT_EVENT));
      redirectToPublicLanding();
    }
    return Promise.reject(error);
  },
);

export default api;
export { apiClient };
