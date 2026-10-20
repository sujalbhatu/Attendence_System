import api from '../api/client';

export const initials = (name = '') =>
  name
    .replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDay = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

export const formatTimeSec = (value) =>
  value ? new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export const percent = (value, digits = 0) =>
  value == null || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(digits)}%`;

export const greeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export const errorText = (err, fallback) => err?.response?.data?.error || err?.message || fallback;

// Downloads the faculty CSV export for one session.
export async function downloadSessionCsv(sessionId, courseCode = 'lecture') {
  const response = await api.get(`/sessions/${sessionId}/export-csv`, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `attendance_${courseCode}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
