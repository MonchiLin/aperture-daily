# Build stage - use Node.js for stable Astro build (Astro official recommendation)
FROM node:22-slim AS build
WORKDIR /usr/src/app

# Copy dependency files
COPY package.json bun.lock* ./

# Install dependencies using npm (compatible with bun.lock)
RUN npm install

# Copy source code
COPY . .

# Build Astro project
ENV NODE_ENV=production
RUN npm run build

# Runtime stage - use Bun for performance
FROM oven/bun:1-slim AS runtime
WORKDIR /app

# Copy only production dependencies and build output
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package.json ./package.json

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

USER bun
CMD ["bun", "run", "./dist/server/entry.mjs"]
