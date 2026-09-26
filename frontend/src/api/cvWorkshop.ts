import { request } from './client';

/** EF-CVX-21 : taille maximale d'un CV importé, contrôlée aussi par l'API. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;

/** Coordonnées repérées dans le CV, gardées à part et jamais envoyées à l'IA (ENF-RGP-07). */
export interface CvContacts {
  name: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  links: string[];
}

/** EF-CVX-23 : bornes du texte de l'offre, contrôlées aussi par l'API. */
export const OFFER_MIN_LENGTH = 200;
export const OFFER_MAX_LENGTH = 20_000;

/** Les quatre dimensions du diagnostic (EF-CVX-24). */
export type Dimension = 'skills' | 'experience' | 'education' | 'techStack';

/** Diagnostic d'un CV face à une offre (EF-CVX-24, EF-CVX-27, EF-CVX-30, RG-23). */
export interface Diagnosis {
  overallScore: number;
  dimensions: Record<Dimension, { score: number; explanation: string }>;
  weakDimensions: Dimension[];
  missingSkills: string[];
}

/** Résultat d'une analyse (schéma `CvAnalysis` dans /api/docs). */
export interface CvAnalysis {
  diagnosis: Diagnosis;
  reading: {
    /** Le texte lu, tel que l'IA le recevra : sans les coordonnées. */
    text: string;
    contacts: CvContacts;
    /** Pages lues par reconnaissance de caractères (EF-CVX-22). */
    ocrPageCount: number;
  };
}

/** EF-CVX-32 : met en file l'analyse du CV face à l'offre ; rend aussitôt l'identifiant de l'exécution. */
export const startCvAnalysis = (fileBase64: string, offer: string) =>
  request<{ runId: number }>('/cv-workshop/analyses', { method: 'POST', body: { file: fileBase64, offer } });

/** Le résultat d'une analyse terminée ; 404 une fois effacé (30 minutes, ENF-RGP-06). */
export const fetchCvAnalysis = (runId: number, signal?: AbortSignal) =>
  request<CvAnalysis>(`/cv-workshop/analyses/${String(runId)}`, { signal });
