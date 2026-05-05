FROM node:20-slim

WORKDIR /app

COPY proxy-package.json package.json
RUN npm install --production

COPY server/proxy.js ./server/proxy.js

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server/proxy.js"]
