/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API URL (Docker image); defaults to the `/api` development proxy. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
