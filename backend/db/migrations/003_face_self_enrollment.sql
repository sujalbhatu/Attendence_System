-- A student can register their own face from their phone after the first login.
-- It waits in face_pending until faculty approves it (in person), and only then becomes
-- the face_embedding that check-ins compare against. The small thumbnail lets faculty
-- see who was registered; it is deleted as soon as they approve or reject.
ALTER TABLE students ADD COLUMN face_pending REAL[];
ALTER TABLE students ADD COLUMN face_pending_thumb TEXT;
ALTER TABLE students ADD COLUMN face_pending_at TIMESTAMPTZ;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_enrollment_source_check;
ALTER TABLE students ADD CONSTRAINT students_enrollment_source_check
  CHECK (enrollment_source IN ('FACULTY', 'SELF_SCAN', 'SELF_PHONE'));
