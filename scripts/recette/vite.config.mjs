// Configuration Vite de la recette : celle de l'interface (frontend/vite.config.ts), dont seuls changent le port et
// la cible du relais /api, pour viser l'API de recette (RECETTE_API_PORT) sur un port choisi (RECETTE_WEB_PORT).
// Aucun paquet importé ici : `vite` et le greffon React sont ceux de frontend/, résolus depuis sa configuration.
import base from '../../frontend/vite.config.ts';

const apiPort = process.env.RECETTE_API_PORT ?? '4000';
const webPort = Number(process.env.RECETTE_WEB_PORT ?? '5173');
const baseProxy = base.server?.proxy?.['/api'] ?? {};

export default {
  ...base,
  root: new URL('../../frontend/', import.meta.url).pathname,
  server: {
    ...base.server,
    port: webPort,
    strictPort: true,
    proxy: { '/api': { ...baseProxy, target: `http://127.0.0.1:${apiPort}` } },
  },
};
