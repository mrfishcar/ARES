# Stage 1: Build TypeScript backend and UI
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY app/ui/review-dashboard/package*.json ./app/ui/review-dashboard/

# Install dependencies
RUN npm install
RUN cd app/ui/review-dashboard && npm install

# Copy source code
COPY . .

# Build TypeScript (transpile only, emit JS even with type errors - tests handle type validation)
RUN npx tsc

# Build Review Dashboard UI
RUN cd app/ui/review-dashboard && npm run build

# Stage 2: Python parser service
FROM python:3.11-slim AS python-base

WORKDIR /python-services

# Install Python dependencies
COPY scripts/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python services
COPY scripts/ ./

# Stage 3: Production runtime
FROM node:20-alpine

WORKDIR /app

# Install Python for parser service
RUN apk add --no-cache python3 py3-pip

# Copy Node.js dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy built TypeScript
COPY --from=builder /app/dist ./dist

# Copy built UI
COPY --from=builder /app/app/ui/review-dashboard/dist ./app/ui/review-dashboard/dist

# Copy Python service and dependencies
COPY --from=python-base /python-services ./scripts
COPY --from=python-base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy configuration and runtime files
COPY config ./config
COPY app ./app

# Create data directories
RUN mkdir -p /app/data/projects /app/incoming /app/wiki

# Expose ports
# 4000: GraphQL API
# 4100: Metrics endpoint
# 8000: Python parser service
EXPOSE 4000 4100 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start script (will be overridden by docker-compose)
CMD ["node", "dist/app/api/graphql.js"]
