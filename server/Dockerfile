FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package.json ./
RUN npm install --production --no-fund --no-audit
COPY . .
RUN mkdir -p /app/data /app/public && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3001
CMD ["node", "index.js"]
