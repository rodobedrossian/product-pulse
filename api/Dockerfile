# Node 20 matches @supabase/* engine requirements in package-lock.json
FROM node:20-alpine

# ffmpeg needed for audio splitting before Whisper upload
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy lockfiles first — Docker caches this layer until they change
COPY package.json package-lock.json ./

RUN npm ci

# Copy the rest of the source
COPY . .

EXPOSE 3001

# GeoIP download must not block /health: Railway probes as soon as the container starts.
# Server listens immediately; MaxMind DB fills in shortly after (geo lookups wait on reader).
CMD ["sh", "-c", "node scripts/download-geoip.mjs & exec node src/index.js"]
