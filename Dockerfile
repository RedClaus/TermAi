# Multi-stage build for TermAI
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/

# Install dependencies
RUN npm ci --only=production && \
    cd server && npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/

# Install all dependencies (including devDependencies)
RUN npm ci && cd server && npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 termai

# Copy built application
COPY --from=builder --chown=termai:nodejs /app/.env.example ./.env
COPY --from=deps --chown=termai:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=termai:nodejs /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=termai:nodejs /app/dist ./dist
COPY --from=builder --chown=termai:nodejs /app/server ./server
COPY --from=builder --chown=termai:nodejs /app/package.json ./package.json

# Switch to non-root user
USER termai

# Expose ports
EXPOSE 3001 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start command
CMD ["npm", "run", "dev:all"]
