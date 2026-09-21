FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
# --ignore-scripts : aucun script d'installation de dépendance n'est exécuté (chaîne d'approvisionnement)
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-slim
# LibreOffice : conversion des CV .docx en PDF ; poppler-utils (pdfinfo) : contrôle 1 page A4 (T-503, EF-CVX-07)
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-crosextra-carlito poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
USER node
# Migrations : service `migrate` distinct (docker-compose.yml), avec son propre compte MySQL.
CMD ["node", "dist/server.js"]
