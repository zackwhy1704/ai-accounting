FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

# nginx:alpine auto-substitutes env vars in /etc/nginx/templates/*.template
# Default values for local dev; Railway overrides via env vars
ENV PORT=80
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=8000
