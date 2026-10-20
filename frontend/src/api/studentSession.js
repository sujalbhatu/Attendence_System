// Student login state shared by the scanner (/scan) and the student portal (/my-attendance).
export const STUDENT_TOKEN_KEY = 'rollone-student-token';
export const STUDENT_DATA_KEY = 'rollone-student-data';

export const loadStudentToken = () => {
  try {
    return localStorage.getItem(STUDENT_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const loadStudentData = () => {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_DATA_KEY) || 'null');
  } catch {
    return null;
  }
};

export const saveStudentSession = (token, student) => {
  try {
    localStorage.setItem(STUDENT_TOKEN_KEY, token);
    localStorage.setItem(STUDENT_DATA_KEY, JSON.stringify(student));
  } catch {
    // Private mode / storage disabled: the session simply won't persist.
  }
};

export const clearStudentSession = () => {
  try {
    localStorage.removeItem(STUDENT_TOKEN_KEY);
    localStorage.removeItem(STUDENT_DATA_KEY);
  } catch {
    // ignore
  }
};

export const studentAuthHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
