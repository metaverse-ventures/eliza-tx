# Stage 1: Builder
FROM node:20-bullseye AS builder
WORKDIR /app

# Install dependencies required for building
RUN apt-get update && apt-get install -y python3 python3-pip make g++ && rm -rf /var/lib/apt/lists/*

# Copy package-related files first for better caching
COPY package.json package-lock.json ./ 
RUN npm ci

# Copy the rest of the application source
COPY . . 

# Build the application
RUN npm run build

# Stage 2: Production Dependencies
FROM node:20-bullseye AS production-deps
WORKDIR /app

# Copy package.json and package-lock.json before running npm install
COPY package.json package-lock.json ./ 

# Disable Sentry profiling to prevent errors
ENV SENTRY_PROFILING_DISABLED=1

# Install only production dependencies with required system tools
RUN apt-get update && apt-get install -y python3 python3-pip make g++ && \
    npm ci --only=production && \
    rm -rf node_modules/@sentry/profiling-node && \
    apt-get remove -y python3 python3-pip make g++ && rm -rf /var/lib/apt/lists/*

# Stage 3: Runner
FROM node:20-bullseye AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
# Disable Sentry profiling to prevent errors
ENV SENTRY_DISABLE_PROFILING=1  

# Create a non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nestjs && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Copy production dependencies
COPY --from=production-deps --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy necessary environment files
COPY --chown=nestjs:nodejs .env* ./

# Expose the application port
EXPOSE 4000

# Start the application
CMD ["node", "--max_old_space_size=2560", "dist/main"]
