FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Railway injects PORT dynamically; default to 8080 for local
ENV PORT=8080
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=8000
