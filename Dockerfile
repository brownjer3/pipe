FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Add openssl for Prisma
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (needed for build)
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/

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
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

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