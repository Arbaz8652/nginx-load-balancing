FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY app/ ./app

EXPOSE 3000

HEALTHCHECK \
	--interval=10s \
	--timeout=3s \
	--start-period=5s \
	--retries=3 \
	CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/health/live', (res) => process.exit(res.statusCode === 200 ? 0: 1)).on('error', ()=> process.exit(1))"]

CMD ["node","app/server.js"]

