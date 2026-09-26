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

/** Résultat d'une analyse (schéma `CvAnalysis` dans /api/docs). */
export interface CvAnalysis {
  reading: {
    /** Le texte lu, tel que l'IA le recevra : sans les coordonnées. */
    text: string;
    contacts: CvContacts;
    /** Pages lues par reconnaissance de caractères (EF-CVX-22). */
    ocrPageCount: number;
  };
}

/** EF-CVX-32 : met l'analyse du CV en file ; rend aussitôt l'identifiant de l'exécution. */
export const startCvAnalysis = (fileBase64: string) =>
  request<{ runId: number }>('/cv-workshop/analyses', { method: 'POST', body: { file: fileBase64 } });

/** Le résultat d'une analyse terminée ; 404 une fois effacé (30 minutes, ENF-RGP-06). */
export const fetchCvAnalysis = (runId: number, signal?: AbortSignal) =>
  request<CvAnalysis>(`/cv-workshop/analyses/${String(runId)}`, { signal });
