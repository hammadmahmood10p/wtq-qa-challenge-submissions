import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one endpoint.
 *
 * On event day this is what tells us something is wrong before 1000 participants do.
 * It deliberately touches the database: a process that is up but cannot reach Postgres
 * is not healthy, and that is exactly the failure mode R1 predicts under load.
 */
export async function GET() {
  const startedAt = Date.now();

  let database: "ok" | "unreachable" = "unreachable";
  let databaseLatencyMs: number | null = null;

  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    databaseLatencyMs = Date.now() - t0;
    database = "ok";
  } catch {
    // swallowed deliberately — never leak connection details from a public endpoint
  }

  const healthy = database === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      databaseLatencyMs,
      storageDriver: env.STORAGE_DRIVER,
      uptimeSeconds: Math.round(process.uptime()),
      checkedInMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
