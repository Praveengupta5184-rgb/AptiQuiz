# 1. Build Stage
FROM node:24-alpine AS builder

WORKDIR /usr/src/app
# Copy package files
COPY package*.json ./
# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# 2. Production Stage
FROM node:24-alpine

WORKDIR /usr/src/app

# Set node environment to production
ENV NODE_ENV=production

# Copy built node_modules and source from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/db ./db
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/package.json ./package.json

# Use a non-root user for security
USER node

# Expose the API port
EXPOSE 3000

# Add a healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
