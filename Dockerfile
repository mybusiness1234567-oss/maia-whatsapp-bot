FROM node:20-slim

WORKDIR /app

# Cache bust: force fresh npm install
ARG CACHEBUST=20260520
COPY package*.json ./
RUN npm install --production && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
