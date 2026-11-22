# Tipoff. No build step, so the image is Node.js, the production dependencies and the source.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY index.js register-commands.js ./
COPY commands ./commands
COPY components ./components
COPY events ./events
COPY migrations ./migrations
COPY services ./services
COPY strings ./strings
COPY utility ./utility

# Logs go to the console (and /app/logs, which is the only place it writes).
RUN mkdir -p logs && chown node:node logs

# Run as the unprivileged "node" user that the image provides.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- "http://127.0.0.1:${HTTP_PORT:-${PORT:-3000}}/health" >/dev/null || exit 1

# Settings come from the environment (docker compose's env_file, or docker run --env-file .env).
CMD ["node", "index.js"]
