import { request } from './client';

/** RG-09 : types de contrat qu'une cible accepte. */
export const TARGET_CONTRACT_TYPES = ['cdi', 'cdd', 'alternance', 'job_etudiant'] as const;
export type TargetContractType = (typeof TARGET_CONTRACT_TYPES)[number];

export const CONTRACT_LABELS: Readonly<Record<TargetContractType, string>> = {
  cdi: 'CDI',
  cdd: 'CDD',
  alternance: 'Alternance',
  job_etudiant: 'Job étudiant',
};

export interface Identity {
  name: string;
  city: string;
  phone: string;
  email: string;
  extra: string | null;
}

export interface Target {
  label: string;
  contractTypes: TargetContractType[];
  keywords: string[];
}

export interface Experience {
  dates: string;
  company: string;
  place: string | null;
  role: string;
  duration: string | null;
  bullets: string[];
}

export interface Degree {
  dates: string;
  school: string;
  place: string | null;
  degree: string | null;
  detail: string | null;
}

export interface Skill {
  label: string;
  value: string;
}

/** RG-18 : niveaux d'études, du plus bas au plus élevé. */
export const STUDY_LEVELS = ['bac', 'bac_2', 'bac_3', 'bac_5', 'doctorat', 'autre'] as const;
export type StudyLevelName = (typeof STUDY_LEVELS)[number];

export const STUDY_LEVEL_LABELS: Readonly<Record<StudyLevelName, string>> = {
  bac: 'Bac',
  bac_2: 'Bac+2 (BTS, DUT, BUT 2)',
  bac_3: 'Bac+3 (licence, bachelor, BUT 3)',
  bac_5: 'Bac+5 (master, diplôme d’ingénieur)',
  doctorat: 'Doctorat',
  autre: 'Autre',
};

/** EF-CVX-18 : le niveau le plus élevé atteint, obtenu ou en cours ; `null` tant qu'il n'est pas renseigné. */
export interface StudyLevel {
  level: StudyLevelName | null;
  isInProgress: boolean;
}

/** EF-CVX-19 : une certification obtenue. L'organisme et l'année sont facultatifs, l'intitulé non. */
export interface Certification {
  name: string;
  issuer: string | null;
  year: number | null;
}

/** Profil de référence du candidat (schéma `CandidateProfile` dans /api/docs, EF-CVX-01). */
export interface CandidateProfile {
  identity: Identity;
  location: { searchArea: string };
  availability: string;
  studyLevel: StudyLevel;
  targets: Target[];
  cvSource: {
    defaultTitle: string;
    defaultSubtitle: string;
    profile: string;
    experiences: Experience[];
    education: Degree[];
    skills: Skill[];
    certifications: Certification[];
    interests: string[];
  };
}

/** EF-CVX-01 : le profil enregistré ; 404 tant qu'il n'y en a pas. */
export const fetchProfile = (signal?: AbortSignal) => request<CandidateProfile>('/profile', { signal });

/** EF-CVX-02 : remplace le profil en entier. */
export const saveProfile = (profile: CandidateProfile) =>
  request<undefined>('/profile', { method: 'PUT', body: profile });

/** Le squelette d'un profil que le candidat n'a pas encore rempli. */
export const emptyProfile = (): CandidateProfile => ({
  identity: { name: '', city: '', phone: '', email: '', extra: null },
  location: { searchArea: '' },
  availability: '',
  studyLevel: { level: null, isInProgress: false },
  targets: [{ label: '', contractTypes: ['cdi'], keywords: [] }],
  cvSource: {
    defaultTitle: '',
    defaultSubtitle: '',
    profile: '',
    experiences: [{ dates: '', company: '', place: null, role: '', duration: null, bullets: [] }],
    education: [{ dates: '', school: '', place: null, degree: null, detail: null }],
    skills: [{ label: '', value: '' }],
    certifications: [],
    interests: [],
  },
});
