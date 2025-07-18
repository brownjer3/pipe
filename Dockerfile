# Use node:20-slim instead of alpine for better Prisma compatibility
FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
# Install OpenSSL and other dependencies
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (needed for build)
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/

# Bypass checksum verification due to Prisma's server issues
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

# Generate Prisma client
RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy node modules and generated files from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src ./src

# Copy all source files
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nodejs

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules ./node_modules

# Copy static assets
COPY --from=builder /app/public ./public

# Create necessary directories
RUN mkdir -p /app/logs && \
    mkdir -p /app/dist/views && \
    chown -R nodejs:nodejs /app

# Copy views to dist
COPY --from=builder /app/src/views ./dist/views

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate:deploy && npm start"]