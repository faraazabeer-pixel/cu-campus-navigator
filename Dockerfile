# ==========================================
# Stage 1: Build the C++ Routing Engine
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install C++ compiler, CMake, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
 && rm -rf /var/lib/apt/lists/*

# Copy build configuration, scripts, source code, and dataset
COPY package.json ./
COPY CMakeLists.txt ./
COPY scripts/ scripts/
COPY engine/ engine/
COPY data/ data/

# Compile the C++ routing engine and run its unit tests to verify correctness
RUN bash scripts/build-engine.sh --test

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

# Copy package manifest
COPY package.json ./

# Copy compiled C++ binary from builder stage
COPY --from=builder /app/build/route_engine ./build/route_engine

# Copy application server, frontend assets, and campus data
COPY server/ ./server/
COPY public/ ./public/
COPY data/ ./data/

# Expose default HTTP port
EXPOSE 5173

# Container healthcheck: verifies HTTP server and C++ routing daemon are responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:" + (process.env.PORT || 5173) + "/api/health").then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))'

# Start the application using standard npm start
CMD ["npm", "start"]
