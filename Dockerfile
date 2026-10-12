# syntax=docker/dockerfile:1.7

# Install pnpm directly (avoid corepack's flaky network download of the pinned version, which was
# failing the build with "fetch failed" while corepack fetched pnpm from registry.npmjs.org).
FROM node:20-alpine AS base
RUN npm install -g pnpm@10.32.1

FROM base AS deps
WORKDIR /app
# GITHUB_TOKEN (a read:packages token) — needed to pull the private @novaforge-team/* package from
# GitHub Packages. Provided as a BuildKit secret (Dokploy → Build-time Secrets), mounted only for
# this command → never written to any image layer. .npmrc reads it via ${GITHUB_TOKEN}.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=secret,id=GITHUB_TOKEN \
    GITHUB_TOKEN="$(cat /run/secrets/GITHUB_TOKEN)" pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S -G app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
