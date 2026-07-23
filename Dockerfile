# Build stage — nothing to build for this simple Express static server,
# but we use multi-stage to keep the final image clean.
FROM node:20-slim AS base
WORKDIR /app

# Install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy app files
COPY server/ ./server/
COPY public/ ./public/

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 --gid 1001 app

# Copy node_modules and app from build stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/server ./server
COPY --from=base /app/public ./public
COPY package.json ./

# Session store directory
RUN mkdir -p .sessions && chown -R app:app .sessions

USER app

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/auth/status',r=>{process.exit(r.statusCode===200?0:1)})" || exit 1

CMD ["node", "server/index.js"]
