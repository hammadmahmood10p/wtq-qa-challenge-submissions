# The production image, and the migration image beside it.
#
# Four stages: deps installs once and is shared, migrator carries the Prisma CLI,
# builder compiles, runner ships. See docs/DEPLOYMENT.md for how they are used.

FROM node:22-alpine AS base
# Activating the pinned version here means no stage stops to download it mid-build,
# and the build stops depending on the npm registry being reachable at that moment.
# Mirrors "packageManager" in package.json.
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Skip the postinstall `prisma generate`; the build stage runs it with the schema present.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- migrator --------------------------------------------------------------
# A separate image for running migrations, because the runtime image cannot.
#
# `output: "standalone"` traces only what the server imports, and the Prisma CLI is
# not one of those things — there is no `prisma` binary in the runtime image and
# `migrate deploy` cannot be run from it. Rather than bloat the runtime image with a
# CLI it never uses, migrations get their own target:
#
#   docker build --target migrator -t wtq-migrator .
#   docker run --rm -e DIRECT_DATABASE_URL=… wtq-migrator
#
# It needs only the schema and the CLI, not a generated client, which is why it can
# reuse the --ignore-scripts dependency layer untouched.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# `migrate deploy` needs only the schema, but the first deploy also has to create the
# bootstrap super admin, and prisma/seed.ts imports the generated client. Generating
# here writes it into src/generated/prisma, so the same image does both:
#
#   docker compose run --rm migrator                          # migrate
#   docker compose run --rm migrator pnpm tsx prisma/seed.ts  # seed, first deploy only
#
# The placeholder is scoped to this one command rather than set as ENV: `generate`
# only reads the schema and never connects, but prisma.config.ts resolves the variable
# at module load and fails without it. Leaving it in the image would mean a forgotten
# runtime value silently pointing at localhost instead of failing loudly.
RUN DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm prisma generate

CMD ["pnpm", "prisma", "migrate", "deploy"]

# --- build -----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# src/lib/env.ts validates at import, so the build needs syntactically valid values
# even though it never connects to anything. They are exported inside this one RUN
# rather than declared as ARG or ENV, so nothing resembling a secret ends up readable
# in `docker inspect` — a fake one there is worse than useless, because it trains
# whoever reads it to ignore exactly the thing they should notice.
RUN export DATABASE_URL="postgresql://build:build@localhost:5432/build"  && export DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build"  && export SESSION_SECRET="build-time-placeholder-value-not-used-at-runtime"  && export CNIC_PEPPER="build-time-placeholder-pepper"  && export CNIC_ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="  && pnpm prisma generate  && pnpm build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# -G puts nextjs *in* the nodejs group. Without it busybox gives the user `nogroup`
# as its primary group, so every `--chown=nextjs:nodejs` below would be writing an
# ownership the running process does not actually hold.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S -G nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The uploads directory has to exist in the image, owned by the user that will write
# to it. When Docker initialises an empty named volume over a path that exists in the
# image, it copies that path's contents *and its ownership* — so this is what makes
# the volume writable. Without it the directory is created root-owned at mount time,
# the app runs as nextjs, and every upload fails with EACCES: found exactly that way,
# by running the container.
#
# A bind mount is different: ownership comes from the host, so the host directory has
# to be chowned to 1001:1001. See docs/DEPLOYMENT.md.
RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data/uploads

# Migrations run from the `migrator` target above, as a separate deploy step —
# several instances starting at once must not race each other applying the same
# migration, and this image has no Prisma CLI to run one with in any case.

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
