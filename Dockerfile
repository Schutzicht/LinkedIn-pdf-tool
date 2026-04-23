# --- Stage 1: Build ---
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Alleen production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Kopieer gebouwde assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "dist/server.js"]
