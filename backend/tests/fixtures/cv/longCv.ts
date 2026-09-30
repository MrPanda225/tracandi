import type { AdaptedCv } from '../../../src/modules/cvWorkshop/adaptedCv.js';
import type { CvContacts } from '../../../src/modules/cvWorkshop/contacts.js';

/** Fictitious contact details (no real person). */
export const FICTITIOUS_CONTACTS: CvContacts = {
  name: 'Camille Durand',
  emails: ['camille.durand@example.com'],
  phones: ['06 12 34 56 78'],
  address: '12 rue des Lilas, 69003 Lyon',
  links: ['linkedin.com/in/camille-durand-exemple'],
};

const BULLET = 'Conception et suivi de tableaux de bord Power BI pour les équipes commerciales de la région.';

/**
 * RG-24: a fictitious CV of 12 experiences, each with `bulletsPerExperience` achievements, and 40 skills —
 * the « CV fictif long » of EF-CVX-36.
 */
export const longCv = (bulletsPerExperience: number): AdaptedCv => ({
  headline: 'Data Analyst',
  profile:
    'Data analyst habituée aux tableaux de bord commerciaux et aux requêtes SQL, en quête d’un poste à Lyon où ' +
    'fiabiliser les données de pilotage.',
  experiences: Array.from({ length: 12 }, (_unused, index) => ({
    title: 'Data Analyst',
    organization: `Atelier Nova ${String(index + 1)}`,
    place: 'Lyon',
    dates: `09/${String(2025 - index)} – 08/${String(2026 - index)}`,
    bullets: Array.from({ length: bulletsPerExperience }, () => BULLET),
  })),
  education: [
    { degree: 'Master Informatique', school: 'Université de Lyon', place: 'Lyon', dates: '2014', detail: null },
    { degree: 'Licence Mathématiques', school: 'Université de Lyon', place: 'Lyon', dates: '2012', detail: null },
  ],
  skills: Array.from({ length: 40 }, (_unused, index) => `Outil ${String(index + 1)}`),
  certifications: [],
  languages: ['Anglais : courant'],
  interests: [],
});

/** The three skills the candidate ticks in EF-CVX-36. */
export const TICKED_SKILLS = ['dbt', 'Airflow', 'Docker'];
