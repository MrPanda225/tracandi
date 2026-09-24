import { ApiError, apiUrl, request, UNREACHABLE_MESSAGE } from './client';

/**
 * EF-AUT-12: every datum held on the user, as the file the API names (`tracandi-donnees-AAAA-MM-JJ.json`).
 * Read as a blob, since it is saved, not shown.
 */
export const downloadMyData = async (): Promise<{ blob: Blob; fileName: string }> => {
  let response: Response;
  try {
    response = await fetch(apiUrl('/account/export'), { credentials: 'include' });
  } catch {
    throw new ApiError(0, UNREACHABLE_MESSAGE);
  }
  if (!response.ok) throw new ApiError(response.status, 'Le téléchargement de vos données a échoué. Réessayez.');
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'tracandi-donnees.json';
  return { blob: await response.blob(), fileName };
};

/** EF-AUT-11: deletes the account and every datum of it; the password is asked again. */
export const deleteMyAccount = (password: string) =>
  request<undefined>('/auth/account', { method: 'DELETE', body: { password } });
