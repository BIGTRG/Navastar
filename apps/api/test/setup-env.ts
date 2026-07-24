// Runs before test modules import app code. Provides a valid env so the shared
// env loader doesn't throw and Prisma can instantiate (no connection is made in
// these tests — they never reach the DB).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-secret-key-at-least-16-chars-long";
// Integration tests run against a REAL Postgres when TEST_DATABASE_URL is set
// (they self-skip otherwise). Point the app at it before anything reads env.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ??= "postgresql://navastar:navastar@localhost:5432/navastar_test?schema=public";
process.env.AI_PROVIDER ??= "stub";
process.env.STORAGE_PROVIDER ??= "stub";
