FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p data && chown -R node:node /app

USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
