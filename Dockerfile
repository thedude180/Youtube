FROM node:20-slim

RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  ffmpeg \
  curl \
  ca-certificates \
  && pip3 install yt-dlp --break-system-packages \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

RUN mkdir -p vault clips reels

EXPOSE 5000

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
