# Belzo eMart API — production image. Pinned base image digest tag (SECURITY-10).
FROM node:20.14.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# OpenSSL is required by the Prisma query/schema engine (client + migrations).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY . .
RUN pnpm --filter @belzo/shared build \
  && pnpm --filter @belzo/api db:generate \
  && pnpm --filter @belzo/api build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
# Run as the non-root user provided by the node image (hardening, SECURITY-09).
USER node
# Copy the whole built workspace so pnpm's per-package node_modules + symlinks
# resolve correctly at runtime (reflect-metadata, @nestjs/*, @belzo/shared, …).
COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/api
# Pre-create the uploads dir as the node user so a mounted named volume
# initialises with writable (node-owned) permissions for local file storage.
RUN mkdir -p uploads
EXPOSE 4000
CMD ["node", "dist/main.js"]
