# Use node:20-slim for better compatibility
FROM node:20-slim AS base

# Build stage - generate Prisma client locally
FROM base AS prisma-generate
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

# Copy only what's needed for Prisma generation
COPY package*.json ./
COPY prisma ./prisma/

# Install only Prisma dependencies
RUN npm install prisma @prisma/client

# Generate Prisma client
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma generate || echo "Prisma generate failed, continuing..."

# Dependencies stage
FROM base AS deps
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies
RUN npm ci

# Copy generated Prisma client from previous stage
COPY --from=prisma-generate /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-generate /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=prisma-generate /app/src/generated ./src/generated

# Build stage
FROM base AS builder
WORKDIR /app

# Copy everything from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src ./src

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nodejs

# Copy application files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

# Copy views to dist
RUN mkdir -p /app/dist/views /app/logs
COPY --from=builder /app/src/views ./dist/views

# Copy generated Prisma files
COPY --from=builder /app/src/generated ./src/generated

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Skip Prisma migration in CMD for now - handle separately
CMD ["npm", "start"]