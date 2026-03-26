FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=3000
ENV BACKEND_HOST=backend.railway.internal
ENV BACKEND_PORT=8000

CMD ["/start.sh"]
