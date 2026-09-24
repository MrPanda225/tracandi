import type { ReactNode } from 'react';
import type { OptionalFeature } from '../../api/settings';

/** One screen of the application, as listed in the navigation (T-003: the 6 pages). */
export interface NavItem {
  /** ENF-MAI-07: the optional feature the screen belongs to; absent for the core screens, always shown. */
  feature?: OptionalFeature;
  path: string;
  label: string;
  /** ENF-UTI-02: what the bottom bar of a phone shows under the icon; the full label stays the accessible name. */
  shortLabel: string;
  icon: ReactNode;
}

// Line icons drawn on a 24 px grid with the same stroke (ui-design: consistent SVG icons).
const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Tableau de bord',
    shortLabel: 'Accueil',
    icon: (
      <Icon>
        <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
        <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
        <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    path: '/candidatures',
    label: 'Candidatures',
    shortLabel: 'Suivi',
    icon: (
      <Icon>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </Icon>
    ),
  },
  {
    path: '/offres',
    feature: 'watch',
    label: 'Offres',
    shortLabel: 'Offres',
    icon: (
      <Icon>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </Icon>
    ),
  },
  {
    path: '/sites',
    feature: 'watch',
    label: 'Sites surveillés',
    shortLabel: 'Sites',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" />
      </Icon>
    ),
  },
  {
    path: '/atelier-cv',
    feature: 'cv',
    label: 'Atelier CV',
    shortLabel: 'CV',
    icon: (
      <Icon>
        <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" />
        <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h4.5" />
      </Icon>
    ),
  },
  {
    path: '/reglages',
    label: 'Réglages',
    shortLabel: 'Réglages',
    icon: (
      <Icon>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </Icon>
    ),
  },
];
