# ─── Stage 1: Install all dependencies ───────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# ─── Stage 2: Build frontend (Vite) ───────────────────────────────────────────
FROM deps AS build-frontend
COPY . .
RUN npm run build

# ─── Stage 3: nginx — serves static frontend, proxies /api/* to backend ───────
FROM nginx:alpine AS frontend
COPY --from=build-frontend /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ─── Stage 4: Node.js backend ─────────────────────────────────────────────────
FROM node:22-alpine AS backend
WORKDIR /app

# Native build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY server.ts ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY src ./src/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
