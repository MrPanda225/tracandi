import { CV_MAX_BYTES } from '../api/cvWorkshop';

export const PDF_TYPE = 'application/pdf';

/**
 * EF-CVX-21: the checks of the PDF a candidate gives, made here to answer at once; the API checks the content again
 * (ENF-SEC-22). Shared by the CV workshop and the CV types of the watch (EF-CVX-39).
 * @returns the reason in French why the file is refused, or null when it is acceptable.
 */
export const describeFileRefusal = (file: File): string | null => {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Ce fichier n’est pas un PDF. Exportez votre CV en PDF, puis réessayez.';
  if (file.size > CV_MAX_BYTES) return 'Votre CV dépasse 5 Mo : essayez une version plus légère.';
  return null;
};

/** Reads a file as base64, without the `data:…;base64,` prefix. Rejects when the browser cannot read it. */
export const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Your browser could not read the file.'));
    reader.readAsDataURL(file);
  });
