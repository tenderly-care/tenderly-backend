# Production-level multi-stage build with Chromium support
# Stage 1: Build dependencies and application
FROM node:18-alpine AS builder

# Install build dependencies in stages to avoid Alpine issues
RUN apk add --no-cache python3 make g++ && \
    apk add --no-cache cairo-dev jpeg-dev pango-dev musl-dev && \
    apk add --no-cache giflib-dev pixman-dev pangomm-dev && \
    apk add --no-cache libjpeg-turbo-dev freetype-dev && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy dependency files first for better layer caching
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci --frozen-lockfile && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Stage 2: Production runtime
FROM node:18-alpine AS runtime

# Install runtime dependencies (skip upgrade to avoid Alpine issues)
RUN apk add --no-cache --update \
    dumb-init ca-certificates \
    cairo jpeg pango musl \
    giflib pixman pangomm \
    libjpeg-turbo freetype harfbuzz \
    nss ttf-freefont && \
    rm -rf /var/cache/apk/*

# Install Chromium separately as it's large (skip upgrade)
RUN apk add --no-cache chromium && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nestjs && \
    adduser -S nestjs -u 1001 -G nestjs

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=builder --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nestjs /app/package*.json ./

# Copy built application
COPY --from=builder --chown=nestjs:nestjs /app/dist ./dist
COPY --from=builder --chown=nestjs:nestjs /app/public ./public

# Create health check script
RUN echo '#!/usr/bin/env node\nconst http = require("http");\nconst options = {\n  hostname: "localhost",\n  port: process.env.PORT || 3000,\n  path: "/api/v1/health",\n  method: "GET",\n  timeout: 10000\n};\nconst req = http.request(options, (res) => {\n  if (res.statusCode === 200) {\n    process.exit(0);\n  } else {\n    process.exit(1);\n  }\n});\nreq.on("error", () => process.exit(1));\nreq.on("timeout", () => process.exit(1));\nreq.end();' > /app/health-check.js && \
    chmod +x /app/health-check.js && \
    chown nestjs:nestjs /app/health-check.js

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Add labels for better container management
LABEL maintainer="tenderly-backend" \
      version="1.0.0" \
      description="Tenderly OB-GYN Telemedicine Backend API" \
      org.opencontainers.image.source="https://github.com/tenderly/backend"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node /app/health-check.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
