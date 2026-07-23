// Validated environment access. Import { env } anywhere in the backend.
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DOMAIN: z.string().default("navastarlogistics.com"),
  API_PORT: z.coerce.number().default(4000),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("navastar-media"),
  S3_ACCESS_KEY: z.string().default("navastar"),
  S3_SECRET_KEY: z.string().default("navastar-secret"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  MAP_PROVIDER: z.enum(["osm", "here"]).default("osm"),
  HERE_API_KEY: z.string().optional().default(""),

  AI_PROVIDER: z.enum(["stub"]).default("stub"),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  ESCROW_PROVIDER: z.enum(["stub"]).default("stub"),
  EVENT_BUS: z.enum(["inprocess", "kafka"]).default("inprocess"),
  FMCSA_WEBKEY: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parse & cache process.env. Throws a readable error if required vars are missing. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Convenience proxy so callers can `import { env }` and read lazily. */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});
