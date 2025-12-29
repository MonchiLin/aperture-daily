# Base image
FROM oven/bun:1

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json ./
# COPY bun.lock ./ # Enable if bun.lock exists and is stable

# Install dependencies
RUN bun install --production

# Copy source code
COPY . .

# Environment variables should be injected at runtime, 
# but we can set defaults or expose ports
ENV PORT=3000

# Build time injection
ARG BUILD_TIME
ENV BUILD_TIME=$BUILD_TIME

# Expose the API port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "index.ts"]
