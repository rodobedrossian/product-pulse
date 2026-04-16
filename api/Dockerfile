FROM node:18-alpine

# ffmpeg needed for audio splitting before Whisper upload
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy lockfiles first — Docker caches this layer until they change
COPY package.json package-lock.json ./

RUN npm ci

# Copy the rest of the source
COPY . .

EXPOSE 3001

CMD ["sh", "-c", "node scripts/download-geoip.mjs && node --max-old-space-size=380 src/index.js"]
