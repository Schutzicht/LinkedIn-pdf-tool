# --- Stage 1: Build ---
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-slim

# Puppeteer/Chromium dependencies
RUN apt-get update \
  && apt-get install -y wget gnupg ca-certificates \
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-key.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-key.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
  && apt-get update \
  && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
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
