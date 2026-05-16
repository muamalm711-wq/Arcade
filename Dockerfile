# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY server.js .

# Cloud Run sets PORT env var; default 8080
ENV PORT=8080
EXPOSE 8080

# Run as non-root for security
USER node

CMD ["node", "server.js"]
