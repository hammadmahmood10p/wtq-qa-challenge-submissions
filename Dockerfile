# Ships even though development does not use Docker.
#
# R0 in docs/DELIVERY_PLAN.md: the 10Pearls IT team has not yet chosen a deployment
# target. If the answer turns out to be on-prem, a container host, or anything other
# than a managed Node platform, this file makes that a non-event rather than a
# scramble in the week before the event.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Skip the postinstall `prisma generate`; the build stage runs it with the schema present.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- build -----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders. The real values are injected at runtime; these exist only
# so that src/lib/env.ts validation passes while Next.js prerenders.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV SESSION_SECRET="build-time-placeholder-value-not-used-at-runtime"
ENV CNIC_PEPPER="build-time-placeholder-pepper"
ENV CNIC_ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm prisma generate && pnpm build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrations are run as a separate deploy step, not on container start: several
# instances starting at once must not race each other applying the same migration.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
