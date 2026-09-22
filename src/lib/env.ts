import { z } from "zod";

/**
 * Server-side environment. Validated once, at startup, so a missing or malformed
 * variable fails the deploy rather than the event.
 *
 * Never import this from a client component — it would leak secrets into the bundle.
 */
const schema = z.object({
  // Pooled endpoint. See R1 in docs/DELIVERY_PLAN.md.
  DATABASE_URL: z.string().min(1),
  // Direct endpoint, used only by the Prisma CLI. Not needed by the running app.
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CNIC_PEPPER: z.string().min(16, "CNIC_PEPPER must be at least 16 characters"),
  CNIC_ENCRYPTION_KEY: z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, "base64").length === 32;
      } catch {
        return false;
      }
    }, "CNIC_ENCRYPTION_KEY must be 32 bytes, base64-encoded (AES-256)"),

  STORAGE_DRIVER: z.enum(["local", "s3", "azure"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional(),

  APP_URL: z.string().url().default("http://localhost:3000"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(20),

  SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        `Copy .env.example to .env and fill it in. See docs/SETUP.md.`,
    );
  }
  return parsed.data;
}

export const env = load();
export type Env = typeof env;
