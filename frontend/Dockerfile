# Stage 1 — Build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=512 npx vite build

# Stage 2 — Serve with Nginx
FROM nginx:alpine
RUN apk add --no-cache wget
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
