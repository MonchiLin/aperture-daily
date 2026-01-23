# Use Python slim image as the final base to ensure Python environment is ready
FROM python:3.11-slim

# Install system dependencies if needed (usually slim has what we need, but for bun we might need unzip/curl if installing manually, but we will copy)
# We might need some basic libs for bun runtime (it usually needs glibc or similar)
# python:3.11-slim is based on Debian Bookworm, which is good.

WORKDIR /app

# Install edge-tts directly
RUN pip install edge-tts --no-cache-dir

# Copy Bun from the official image
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
# Also copy /usr/local/bin/bunx if it exists, but `bun run` is enough.

# Copy dependency files
COPY package.json ./
# COPY bun.lock ./

# Install dependencies (production only)
RUN bun install --production

# Copy source code
COPY . .

# Environment setup
ENV PORT=7860
ENV NODE_ENV=production

# Build time injection
ARG BUILD_TIME
ENV BUILD_TIME=$BUILD_TIME

# Expose port
EXPOSE 7860

# Start command
# Ensure python script path is correct
CMD ["/bin/sh", "-c", "bun run migrate up && bun run index.ts"]
