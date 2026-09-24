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
# Migrations générées par drizzle-kit, appliquées par le service `migrate`
COPY drizzle ./drizzle
# Dans le conteneur, l'API écoute toutes les interfaces : l'hébergeur (Northflank) ou Docker en publie le port
# (ENF-SEC-01 : hors conteneur, 127.0.0.1 reste la valeur par défaut du code).
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
EXPOSE 4000
# L'hébergeur redémarre un conteneur dont l'API ne répond plus (ENF-FIA-01).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
USER node
# Migrations : lancées à part avec le même image (`node dist/db/migrate.js`) et le rôle propriétaire
# (DATABASE_URL_MIGRATOR) — service `migrate` en local, tâche dédiée sur Northflank (docs/DEPLOIEMENT.md).
CMD ["node", "dist/server.js"]
