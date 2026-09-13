FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS base
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0

FROM base AS install
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile

FROM install AS development
COPY . .
CMD ["bun", "run", "dev"]

FROM base AS production-dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile --production

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=bun:bun /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=bun:bun /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=production-dependencies --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --chown=bun:bun apps/api/package.json ./apps/api/package.json
COPY --chown=bun:bun apps/api/src ./apps/api/src
COPY --chown=bun:bun packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=bun:bun packages/contracts/src ./packages/contracts/src

USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://localhost:3000/health/live');if(!r.ok)process.exit(1)"]
CMD ["bun", "run", "--filter", "@pacecraft/api", "start"]
