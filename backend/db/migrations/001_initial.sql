-- RollOne schema (PostgreSQL 14+). Replaces the MongoDB collections one-to-one.
-- gen_random_uuid() is built in from PostgreSQL 13.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'faculty' CHECK (role IN ('faculty', 'admin')),
  department    TEXT NOT NULL DEFAULT 'Computer Science & Engineering',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classrooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     TEXT NOT NULL UNIQUE,
  building      TEXT NOT NULL,
  floor         INTEGER NOT NULL DEFAULT 1,
  capacity      INTEGER NOT NULL DEFAULT 70,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL DEFAULT 35,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code   TEXT NOT NULL,
  course_name   TEXT NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 4,
  department    TEXT NOT NULL,
  semester      INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  academic_year TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_code, academic_year)
);

CREATE TABLE students (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number          TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  password_hash        TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  email                TEXT,
  department           TEXT NOT NULL DEFAULT 'Computer Science & Engineering',
  batch                TEXT NOT NULL DEFAULT '2023-2027',
  section              TEXT NOT NULL DEFAULT 'A',
  face_embedding       REAL[],          -- 512-d FaceNet vector
  photo_url            TEXT,
  is_enrolled          BOOLEAN NOT NULL DEFAULT false,
  enrolled_at          TIMESTAMPTZ,
  enrollment_source    TEXT CHECK (enrollment_source IN ('FACULTY', 'SELF_SCAN')),
  embedding_version    INTEGER NOT NULL DEFAULT 1,
  embedding_updated_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_department_batch_idx ON students (department, batch);

CREATE TABLE enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  branch        TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dropped')),
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);
CREATE INDEX enrollments_course_branch_status_idx ON enrollments (course_id, branch, status);

CREATE TABLE faculty_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  branch        TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, course_id, branch, academic_year)
);

CREATE TABLE sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code            TEXT NOT NULL,
  course_name            TEXT NOT NULL,
  course_id              UUID REFERENCES courses (id) ON DELETE SET NULL,
  branch                 TEXT NOT NULL DEFAULT '',
  faculty_id             UUID NOT NULL REFERENCES users (id),
  classroom_id           UUID NOT NULL REFERENCES classrooms (id),
  session_date           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                 TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONCLUDED')),
  totp_secret            TEXT NOT NULL,
  token_interval_seconds INTEGER NOT NULL DEFAULT 4,
  require_pin            BOOLEAN NOT NULL DEFAULT false,
  require_liveness       BOOLEAN NOT NULL DEFAULT true,  -- decided by the server, never by the client
  present_count          INTEGER NOT NULL DEFAULT 0,
  flagged_count          INTEGER NOT NULL DEFAULT 0,
  concluded_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_faculty_date_idx ON sessions (faculty_id, session_date DESC);
CREATE INDEX sessions_course_branch_idx ON sessions (course_id, branch);
CREATE INDEX sessions_active_idx ON sessions (id) WHERE status = 'ACTIVE';

-- Short-lived phase-1 tickets. MongoDB deleted these with a TTL index; here every read
-- checks expire_at and a background job deletes old rows.
CREATE TABLE claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_ticket      TEXT NOT NULL UNIQUE,
  session_id        UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  roll_number       TEXT NOT NULL,
  client_latitude   DOUBLE PRECISION,
  client_longitude  DOUBLE PRECISION,
  client_accuracy_m DOUBLE PRECISION,
  token_step        BIGINT,           -- rotation window the scanned QR token belonged to
  assigned_delay_ms INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'AWAITING_BIOMETRICS'
                    CHECK (status IN ('AWAITING_PIN', 'AWAITING_BIOMETRICS')),
  pin_deadline      TIMESTAMPTZ,
  pin_attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at         TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '60 seconds',
  UNIQUE (session_id, student_id)
);
CREATE INDEX claims_expire_at_idx ON claims (expire_at);

CREATE TABLE attendance_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  -- SET NULL keeps the attendance history (roll number + name are copied in) if a student is removed
  student_id        UUID REFERENCES students (id) ON DELETE SET NULL,
  roll_number       TEXT NOT NULL,
  student_name      TEXT NOT NULL,
  course_code       TEXT NOT NULL,
  room_code         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'FLAGGED')),
  flag_reason       TEXT,             -- e.g. FIRST_SELF_ENROLLMENT, shown to faculty for review
  cosine_similarity DOUBLE PRECISION NOT NULL,
  threshold         DOUBLE PRECISION NOT NULL DEFAULT 0.65,
  liveness_score    DOUBLE PRECISION,
  liveness_passed   BOOLEAN NOT NULL DEFAULT true,
  distance_meters   DOUBLE PRECISION NOT NULL DEFAULT 0,
  marked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One record per student per session, enforced by the database even under concurrent scans
  UNIQUE (session_id, student_id)
);
CREATE INDEX attendance_session_marked_idx ON attendance_records (session_id, marked_at DESC);
CREATE INDEX attendance_student_idx ON attendance_records (student_id);
