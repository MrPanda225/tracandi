// Recette locale : chargé par `node --import` avant le backend (scripts/recette/run-backend.sh). Rien ne sort de la
// machine, aucune ligne du code de l'application n'est modifiée.
// - api.resend.com : l'e-mail n'est pas envoyé, il est écrit dans .run/mails.jsonl (lien d'activation, code de
//   connexion) ;
// - api.groq.com : faux Groq, qui répond avec les réponses enregistrées de backend/tests/fixtures/llm/ ou une réponse
//   construite à partir de la demande ; le fichier .run/ia-down le fait répondre 503 (IA en panne) ;
// - tout autre hôte non local, par fetch comme par http(s).request : refusé, noté dans .run/blocked.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const SCRIPTS = new URL('.', import.meta.url).pathname;
const FIXTURES = new URL('../../backend/tests/fixtures/llm/', import.meta.url).pathname;
const RUN = process.env.RECETTE_RUN_DIR || `${SCRIPTS}.run`;
mkdirSync(RUN, { recursive: true });
const MAILS = `${RUN}/mails.jsonl`;
const CALLS = `${RUN}/llm-calls.jsonl`;
const BLOCKED = `${RUN}/blocked.jsonl`;
const IA_DOWN = `${RUN}/ia-down`;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const original = globalThis.fetch;

const now = () => new Date().toISOString();
const record = (file, entry) => appendFileSync(file, `${JSON.stringify({ at: now(), ...entry })}\n`);
const fixture = (name) => JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- Réponses du faux modèle ----------

const lineRefs = (prompt) => [...prompt.matchAll(/^L(\d+): (.*)$/gm)].map((m) => ({ line: Number(m[1]), text: m[2] }));

const finder = (lines) => (sub, nth = 0) => {
  const hits = lines.filter((l) => l.text.includes(sub));
  const hit = hits[nth] ?? hits[0];
  return hit ? { line: hit.line, text: sub } : null;
};

// parse_cv : références aux lignes des CV fictifs des tests (buildTwoColumnCv, FICTITIOUS_STRUCTURE), sinon fixture.
const parseCv = (prompt) => {
  const ref = finder(lineRefs(prompt));
  if (prompt.includes('Nordwave')) {
    return {
      headline: ref('Ingénieure DevOps', 0),
      profile: [],
      experiences: [
        {
          title: ref('Ingénieure DevOps', 1), organization: ref('Nordwave Systems'), place: ref('Nantes'),
          dates: ref('09/2022 – 06/2024'),
          bullets: [ref('Automatisation des déploiements avec GitLab CI.'), ref('Supervision Prometheus de 40 services.')],
        },
        {
          title: ref('Technicienne systèmes'), organization: ref('Atelier Brume'), place: null, dates: ref('2020 – 2022'),
          bullets: [ref('Administration de serveurs Linux.')],
        },
      ],
      education: [
        { degree: ref('Master Informatique'), school: ref('Université de Rennes'), place: null, dates: ref('2018 – 2020'), details: [] },
      ],
      skills: ['Docker', 'Kubernetes', 'Terraform', 'Python'].map((s) => ref(s)).filter(Boolean),
      certifications: [], languages: [], interests: [],
    };
  }
  if (prompt.includes('Atelier Nova') && prompt.includes('equipes commerciales')) {
    return {
      headline: ref('Data Analyst', 0), profile: [],
      experiences: [{
        title: ref('Data Analyst', 1), organization: ref('Atelier Nova'), place: null, dates: ref('09/2024'),
        bullets: [ref('Tableaux de bord Power BI pour 12 equipes commerciales.')],
      }],
      education: [{ degree: ref('Master Informatique'), school: ref('Universite de Lyon'), place: null, dates: ref('2024'), details: [] }],
      skills: [ref('SQL'), ref('Python'), ref('Power BI', 1)].filter(Boolean),
      certifications: [], languages: [], interests: [],
    };
  }
  return fixture('parse_cv');
};

// tailor_cv : reprend les identifiants du CV envoyé, sans rien inventer.
const tailorCv = (prompt) => {
  const cv = (prompt.match(/<cv>([\s\S]*?)<\/cv>/) ?? [])[1] ?? prompt;
  const ids = (re) => [...cv.matchAll(re)].map((m) => m[1]);
  const experiences = ids(/^(exp_\d+) — /gm).map((id) => ({
    id,
    bullets: [...cv.matchAll(new RegExp(`^${id}\\.b\\d+: (.*)$`, 'gm'))].map((m) => m[1]),
  }));
  const education = ids(/^(edu_\d+) — /gm).map((id) => ({ id, details: ids(new RegExp(`^(${id}\\.d\\d+): `, 'gm')) }));
  return {
    headline: (cv.match(/^headline: (.*)$/m) ?? [])[1] ?? null,
    profile: 'Profil rigoureux et autonome, prêt à rejoindre une équipe exigeante.',
    experiences,
    education,
    skills: ids(/^(skill_\d+): /gm),
    certifications: ids(/^(cert_\d+): /gm),
    languages: ids(/^(lang_\d+): /gm),
    interests: ids(/^(int_\d+): /gm),
    changes: [
      { target: 'profile', reason: 'Le profil met en avant ce que l’offre demande.' },
      ...experiences.slice(0, 1).map((e) => ({ target: e.id, reason: 'Les réalisations utiles à l’offre passent en tête.' })),
    ],
  };
};

// score_offers : une note par offre du lot (<offer ref="N">), de 55 à 85.
const scoreOffers = (prompt) => ({
  offers: [...prompt.matchAll(/<offer ref="(\d+)">/g)].map((m, index) => ({
    ref: Number(m[1]),
    score: 85 - ((index * 10) % 40),
    reason: 'Note de recette : réponse construite par le faux modèle local.',
  })),
});

// extract_offer_traits : l'intitulé lu dans l'offre collée, des mots-clés fixes.
const extractOfferTraits = (prompt) => {
  const offer = (prompt.match(/<offer>\n([\s\S]*?)\n<\/offer>/) ?? [])[1] ?? '';
  const title = offer.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Data analyst';
  return { title: title.slice(0, 120), keywords: ['sql', 'python', 'power bi'] };
};

const TASKS = [
  ['Tu structures un CV', 'parse_cv', parseCv],
  ['Tu adaptes le CV', 'tailor_cv', tailorCv],
  ['Tu compares le CV', 'diagnose_cv', () => fixture('diagnose_cv')],
  ['Tu lis le CV d’un candidat', 'deduce_profile', () => fixture('deduce_profile')],
  ['Tu lis la page carrières', 'extract_offers', () => fixture('extract_offers')],
  ['Tu lis une offre d’emploi', 'extract_offer_traits', extractOfferTraits],
  ['Tu notes des offres', 'score_offers', scoreOffers],
  ['Tu rédiges, pour un candidat', 'write_follow_up', () => fixture('write_follow_up')],
];

const answerFor = (system, prompt) => {
  const found = TASKS.find(([opening]) => system.includes(opening));
  return found ? { task: found[1], data: found[2](prompt) } : { task: 'inconnue', data: {} };
};

const fakeGroq = (url, init) => {
  if (url.pathname.endsWith('/models')) return json({ data: [{ id: 'faux-groq-1' }] });
  const body = JSON.parse(init.body ?? '{}');
  const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
  const prompt = body.messages?.find((m) => m.role === 'user')?.content ?? '';
  if (existsSync(IA_DOWN)) {
    record(CALLS, { model: body.model, task: 'refusée (503, .run/ia-down présent)' });
    return json({ error: { message: 'Service unavailable (recette locale)' } }, 503);
  }
  const { task, data } = answerFor(system, prompt);
  record(CALLS, { model: body.model, task });
  return json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(data) } }],
    usage: { prompt_tokens: 900, completion_tokens: 300 },
  });
};

// ---------- Interception des appels sortants ----------

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.resend.com') {
    const body = JSON.parse(init.body ?? '{}');
    record(MAILS, { to: body.to, subject: body.subject, html: body.html });
    return json({ id: 'recette-locale' });
  }
  if (url.hostname === 'api.groq.com') return fakeGroq(url, init);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    record(BLOCKED, { via: 'fetch', host: url.hostname });
    throw new TypeError(`recette locale : appel sortant bloqué vers ${url.hostname}`);
  }
  return original(input, init);
};

// Bibliothèques qui passent par http(s).request plutôt que fetch (googleapis, par exemple) : même refus.
const hostOf = (args) => {
  const [first, second] = args;
  if (typeof first === 'string' || first instanceof URL) return new URL(first).hostname;
  const options = first ?? second ?? {};
  return options.hostname ?? options.host?.split(':')[0] ?? 'localhost';
};

for (const module of [http, https]) {
  for (const name of ['request', 'get']) {
    const real = module[name];
    module[name] = (...args) => {
      const host = hostOf(args);
      if (!LOCAL_HOSTS.has(host)) {
        record(BLOCKED, { via: `${module === https ? 'https' : 'http'}.${name}`, host });
        throw new Error(`recette locale : appel sortant bloqué vers ${host}`);
      }
      return real.apply(module, args);
    };
  }
}
syncBuiltinESMExports();
