# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=786 \
    HOSTNAME=0.0.0.0

# ffmpeg lets the app convert audio when needed; small enough to keep in.
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app

# Copy only what `next start` needs at runtime.
COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/next.config.mjs ./next.config.mjs

# Persisted dirs. The app writes the JSON db under ./data and Suno downloads
# go to ../SunoMusic (i.e. /SunoMusic inside the container) — mount both as
# volumes if you want them to survive container restarts.
RUN mkdir -p /app/data /app/public/audio /SunoMusic \
 && chown -R app:app /app/data /app/public/audio /SunoMusic

USER app
EXPOSE 786
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "786"]
