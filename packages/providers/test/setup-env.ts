// Provide a valid env so the shared loader doesn't throw when providers
// instantiate (no network is used by the stub tests).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-secret-key-at-least-16-chars-long";
process.env.DATABASE_URL ??= "postgresql://navastar:navastar@localhost:5432/navastar_test?schema=public";
process.env.STORAGE_PROVIDER ??= "stub";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_BUCKET ??= "navastar-media";
