// Optional demo accounts, filled in at build time (frontend/.env.production.local).
// Each "Use demo account" button only appears when both of its values are set.
export const DEMO_STUDENT_ROLL = import.meta.env.VITE_DEMO_STUDENT_ROLL || '';
export const DEMO_STUDENT_PASSWORD = import.meta.env.VITE_DEMO_STUDENT_PASSWORD || '';
export const HAS_DEMO_STUDENT = Boolean(DEMO_STUDENT_ROLL && DEMO_STUDENT_PASSWORD);
