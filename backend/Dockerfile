FROM oven/bun:1

WORKDIR /app

# Copy dependency files dulu agar cache optimal
COPY package.json bun.lock ./

# Install production dependencies
RUN bun install

# Copy source code
COPY . .

# Generate Prisma Client (Wajib!)
RUN bunx prisma generate

EXPOSE 3000

ENV NODE_ENV=production

# Jalankan server (Bun bisa run .ts langsung)
CMD ["bun", "run", "src/server.ts"]