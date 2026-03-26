FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Railway sets PORT dynamically. Default to 8080.
ENV PORT=8080
ENV BACKEND_HOST=backend.railway.internal
ENV BACKEND_PORT=8000

EXPOSE 8080
