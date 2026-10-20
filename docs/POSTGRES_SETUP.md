# Moving RollOne from MongoDB Atlas to PostgreSQL (Neon)

RollOne now stores everything in PostgreSQL. These are the steps to set up a free
managed Postgres on [Neon](https://neon.tech), copy the existing Atlas data across,
and point the server at it.

## 1. Create the database (5 minutes, in the browser)

1. Go to <https://neon.tech> and sign up (GitHub login works).
2. Create a project:
   - **Name:** `rollone`
   - **Postgres version:** the default (17) is fine
   - **Region:** pick the one closest to your Oracle server (for an Oracle VM in India, `AWS Asia Pacific (Singapore)`).
3. On the project dashboard click **Connect**. Copy the connection string. It looks like:

   ```
   postgresql://neondb_owner:xxxxxxxx@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Keep it secret: it contains the password.
4. Optional but useful for tests: in the Neon console create a **branch** called `test`
   and copy its connection string too. That's your `TEST_DATABASE_URL`
   (the tests wipe it, so never point it at the real data).

## 2. Configure the backend

In `backend/.env` (copy from `backend/.env.example`):

```env
DATABASE_URL=postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

Start the server once (`npm start`). It creates all the tables by itself
(you'll see `[MIGRATE] Applied 001_initial.sql`).

## 3. Copy the old data from MongoDB Atlas (one time)

With **both** connection strings in `backend/.env`:

```env
MONGODB_URI=mongodb+srv://...atlas.../campustrack
DATABASE_URL=postgresql://...neon.../neondb?sslmode=require
```

run:

```bash
cd backend
npm install          # installs the mongodb driver used only by this script
npm run migrate:from-mongo
```

What it does:
- copies users, classrooms, courses, students (with face embeddings), enrollments,
  faculty assignments, sessions and attendance records;
- runs in one transaction, so if anything fails nothing is written;
- refuses to run if Postgres already has users (no double import);
- clears student passwords that were just their roll number (the old default):
  give those students a new password from the Students page.

After it finishes, remove `MONGODB_URI` from `.env`. Keep the Atlas cluster
around (paused) until you're happy everything is there.

## 4. Run the tests

The tests need an empty Postgres database (they wipe it). Locally that can be the
Neon `test` branch from step 1:

```bash
cd backend
TEST_DATABASE_URL=postgresql://...neon...test... npm test
```

They cover the security fixes, the claim → PIN → face flow, concluding a lecture,
and the Mongo copy script (66 tests).

## 5. Deploy

On the server, update `.env` with `DATABASE_URL` and restart the backend.
Nothing else changes for the frontend.

## Why these choices (for interviews)

- **Relational data:** users, courses, enrollments, sessions and attendance all
  reference each other; foreign keys keep them consistent, which MongoDB didn't enforce.
- **Atomic attendance commit:** verify inserts the record, bumps the session's
  present or flagged counter, saves the face template and deletes the claim in **one transaction**.
- **PIN attempts counted in the database:** a wrong PIN is `UPDATE ... SET pin_attempts = pin_attempts + 1
  RETURNING pin_attempts`, so parallel guesses can't get more tries than allowed.
- **Idempotency under concurrency:** `UNIQUE (session_id, student_id)` plus
  `INSERT ... ON CONFLICT DO NOTHING` means two simultaneous verifications produce
  exactly one row (there's a test that fires two in parallel).
- **No N+1 queries:** the student portal and course stats used one query per course
  or student; they're now single `GROUP BY` queries with `count(*) FILTER (...)`.
- **Set-based absentee marking:** concluding a lecture inserts every ABSENT row with one
  `INSERT ... SELECT ... ON CONFLICT DO NOTHING`.
- **One claim per student per session:** `UNIQUE (session_id, student_id)` with an upsert,
  so two quick scans can't open two claims.
- **TTL replacement:** Postgres has no TTL index, so claim reads check `expire_at > now()`
  and a background sweep deletes expired rows every 5 minutes.
- **Embeddings:** stored as `REAL[]` (512 floats). If 1:N face search is ever needed,
  Neon supports the `pgvector` extension for indexed nearest-neighbour search.
