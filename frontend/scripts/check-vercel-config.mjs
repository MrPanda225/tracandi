// BES-39: stops a Vercel build whose API relay still points to the placeholder, instead of shipping an interface
// whose every call fails. Run by the `buildCommand` of vercel.json, before `npm run build`.
import { readFileSync } from 'node:fs';

const PLACEHOLDER = 'REMPLACER-PAR-L-HOTE-NORTHFLANK';
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const relay = config.rewrites?.find((rewrite) => rewrite.source === '/api/:path*');

const fail = (message) => {
  process.stderr.write(`vercel.json : ${message}\n`);
  process.exit(1);
};

if (!relay || relay.destination.includes(PLACEHOLDER)) {
  fail(
    'remplacez REMPLACER-PAR-L-HOTE-NORTHFLANK par l’adresse publique du service API sur Northflank ' +
      '(docs/DEPLOIEMENT.md, étape 3).',
  );
}
if (!relay.destination.startsWith('https://')) fail('l’API doit être jointe en HTTPS.');
