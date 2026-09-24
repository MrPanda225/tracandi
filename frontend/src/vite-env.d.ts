/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API URL (Docker image); defaults to the `/api` development proxy. */
  readonly VITE_API_URL?: string;
  /** EF-LEG-01: publisher of the site shown in the legal pages; a default applies when absent (lib/legal.ts). */
  readonly VITE_LEGAL_PUBLISHER?: string;
  /** EF-LEG-01: address to write to about the site and personal data. */
  readonly VITE_LEGAL_CONTACT?: string;
  /** EF-LEG-01: host of the application (name and address), once chosen (Q-18). */
  readonly VITE_LEGAL_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
