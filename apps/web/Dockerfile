# Belzo eMart Web — production image. Pinned base image tag (SECURITY-10).
FROM node:20.14.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
# Public API base URL is inlined into the client bundle at build time, so it
# must be supplied as a build arg for production images (SSR uses the runtime
# env var instead, which can point at the internal API service).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN pnpm --filter @belzo/shared build \
  && pnpm --filter @belzo/web build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
USER node
# Copy the whole built workspace so pnpm's per-package node_modules + symlinks
# resolve at runtime (next, react, @belzo/shared, …).
COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/web
EXPOSE 3000
# Run Next's CLI entry directly (avoid pnpm→corepack fetch and the .bin sh shim).
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
