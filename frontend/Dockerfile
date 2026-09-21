FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=http://127.0.0.1:4000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
