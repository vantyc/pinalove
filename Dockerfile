# Build frontend + backend
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime — Node serves /pinalove UI + API. SQLite lives on /data (hostPath).
FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV APP_ROOT=/app
ENV LISTEN_ADDR=:8080
ENV BASE_PATH=/pinalove
ENV SQLITE_PATH=/data/pinalove.sqlite
ENV STATIC_DIR=/app/dist/frontend
ENV FIXTURES_PATH=/app/fixtures/sample-profiles.json
ENV SEED_ON_EMPTY=1

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/fixtures ./fixtures

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8080
CMD ["node", "dist/backend/src/index.js"]
