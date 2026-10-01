import type { ContractType } from './stats';
import type { SourceAdapterId } from './sites';
import { request } from './client';

/** EF-VEI-18 : les vues de l'écran — à regarder (nouvelles et gardées), gardées, écartées, postulées. */
export type OfferView = 'active' | 'saved' | 'dismissed' | 'applied';

export type OfferStatus = 'new' | 'saved' | 'dismissed' | 'applied';

/** Une offre repérée par la veille (schéma `Offer` dans /api/docs). */
export interface Offer {
  id: number;
  title: string;
  companyName: string;
  location: string | null;
  contractType: ContractType;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  relevanceScore: number | null;
  relevanceReason: string | null;
  matchedTarget: string | null;
  status: OfferStatus;
  source: { adapter: SourceAdapterId; label: string };
  applicationId: number | null;
}

export interface OfferQuery {
  view: OfferView;
  minScore?: number;
  contractType?: ContractType;
  offset?: number;
}

export const OFFERS_PAGE_SIZE = 50;

const searchOf = (query: OfferQuery): string => {
  const params = new URLSearchParams({ view: query.view, limit: String(OFFERS_PAGE_SIZE) });
  if (query.minScore !== undefined) params.set('minScore', String(query.minScore));
  if (query.contractType !== undefined) params.set('contractType', query.contractType);
  if (query.offset) params.set('offset', String(query.offset));
  return params.toString();
};

/** EF-VEI-16, EF-VEI-17, EF-VEI-22 : une page d'offres, meilleur score d'abord. */
export const fetchOffers = (query: OfferQuery, signal?: AbortSignal) =>
  request<{ items: Offer[]; total: number }>(`/offers?${searchOf(query)}`, { signal });

/** EF-VEI-16 : le texte d'une offre, absent de la liste. */
export const fetchOfferDescription = (id: number, signal?: AbortSignal) =>
  request<Offer & { description: string | null }>(`/offers/${String(id)}`, { signal }).then(
    (offer) => offer.description,
  );

/** EF-VEI-18 : garder, écarter, ou remettre une offre à regarder. */
export const setOfferStatus = (id: number, status: Exclude<OfferStatus, 'applied'>) =>
  request<Offer>(`/offers/${String(id)}`, { method: 'PATCH', body: { status } });

/** EF-VEI-19, EF-VEI-20 : déclare avoir postulé ; une candidature « Envoyée » est créée. */
export const applyToOffer = (id: number) =>
  request<{ offer: Offer; applicationId: number }>(`/offers/${String(id)}/apply`, { method: 'POST' });
