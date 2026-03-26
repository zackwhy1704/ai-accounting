FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=https://ai-accounting-production-adce.up.railway.app/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=3000

CMD ["/start.sh"]
