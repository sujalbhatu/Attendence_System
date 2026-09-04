const BASE_URL = 'http://localhost:3001/api';

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only add Content-Type if it's not FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || 'API Error');
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) => apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),
  signup: (name, email, password, role) => apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role })
  }),
  getMe: () => apiFetch('/auth/me'),

  // Students
  getStudents: (search = '', section = '') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (section) params.append('section', section);
    return apiFetch(`/students?${params.toString()}`);
  },
  enrollStudent: (formData) => apiFetch('/students/enroll', {
    method: 'POST',
    body: formData
  }),
  deleteStudent: (id) => apiFetch(`/students/${id}`, {
    method: 'DELETE'
  }),

  // Attendance
  recognizeFace: (formData) => apiFetch('/attendance/recognize', {
    method: 'POST',
    body: formData
  }),
  getAttendanceToday: (section = '') => {
    const endpoint = section ? `/attendance/today/${section}` : '/attendance/today';
    return apiFetch(endpoint);
  },
  startSession: (section) => apiFetch('/attendance/session/start', {
    method: 'POST',
    body: JSON.stringify({ section })
  }),
  endSession: () => apiFetch('/attendance/session/end', {
    method: 'POST'
  }),
  getHistory: () => apiFetch('/attendance/history'),

  // Analytics
  getAnalyticsOverview: (section = '') => {
    const params = new URLSearchParams();
    if (section) params.append('section', section);
    return apiFetch(`/analytics/overview?${params.toString()}`);
  },
  getTrends: (startDate, endDate, section) => {
    const params = new URLSearchParams({ startDate, endDate });
    if (section) params.append('section', section);
    return apiFetch(`/analytics/trends?${params.toString()}`);
  },
  getLowAttendance: () => apiFetch('/analytics/low-attendance'),
  getSections: () => apiFetch('/analytics/sections'),
  exportCSV: () => {
    const token = localStorage.getItem('token');
    window.open(`${BASE_URL}/analytics/export?token=${token}`, '_blank');
  }
};
