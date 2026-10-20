import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use((config) => {
  // Student pages pass their own token; only fall back to the faculty login when none was given
  const token = localStorage.getItem('campustrack_jwt');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on unauthorized if not on scan page
      if (!window.location.pathname.startsWith('/scan')) {
        localStorage.removeItem('campustrack_jwt');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
