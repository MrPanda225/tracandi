import { ApiError, apiUrl, request, UNREACHABLE_MESSAGE } from './client';

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

/** Le CV adapté à l'offre, section par section, sans les coordonnées (EF-CVX-25, schéma `AdaptedCv`). */
export interface AdaptedCv {
  headline: string;
  profile: string;
  experiences: {
    title: string;
    organization: string | null;
    place: string | null;
    dates: string | null;
    bullets: string[];
  }[];
  education: {
    degree: string;
    school: string | null;
    place: string | null;
    dates: string | null;
    detail: string | null;
  }[];
  skills: string[];
  certifications: string[];
  languages: string[];
  interests: string[];
}

/** EF-CVX-29 : une modification du CV, avec sa raison. */
export interface CvChange {
  section: string;
  before: string;
  after: string;
  reason: string;
}

/** Résultat d'une analyse (schéma `CvAnalysis` dans /api/docs). */
export interface CvAnalysis {
  diagnosis: Diagnosis;
  adapted: { cv: AdaptedCv; changes: CvChange[] };
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

/**
 * EF-CVX-31 : le CV adapté au format Word, avec les compétences cochées (EF-CVX-28). Lu comme un fichier, puisqu'il
 * est enregistré et non affiché.
 */
export const downloadAdaptedCv = async (
  runId: number,
  addedSkills: readonly string[],
): Promise<{ blob: Blob; fileName: string }> => {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/cv-workshop/analyses/${String(runId)}/docx`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addedSkills }),
    });
  } catch {
    throw new ApiError(0, UNREACHABLE_MESSAGE);
  }
  if (!response.ok) {
    const message =
      response.status === 404
        ? 'Cette analyse n’est plus disponible : relancez-la pour télécharger votre CV.'
        : 'Le téléchargement n’a pas abouti. Réessayez dans un instant.';
    throw new ApiError(response.status, message);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'cv-adapte.docx';
  return { blob: await response.blob(), fileName };
};
