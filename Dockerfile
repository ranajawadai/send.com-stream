FROM node:20

# Install p7zip-full (handles RAR) and wget
RUN apt-get update && \
    apt-get install -y p7zip-full wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY proxy-package.json package.json
RUN npm install --production

COPY server/proxy.js ./server/proxy.js

# Create data directory for downloads and extractions
RUN mkdir -p /data/downloads /data/extracted

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server/proxy.js"]
