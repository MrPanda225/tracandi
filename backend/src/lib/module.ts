import type { Router } from 'express';
import type { OpenAPIRegistry } from './openapi.js';

/**
 * A feature plugged into `/api` by createApp. Protected modules are mounted behind the session guard (EF-AUT-05);
 * `isPublic` is reserved to account creation, login, logout and Google's OAuth redirection (which arrives without the
 * session cookie and is tied to its user by a single-use state, ENF-SEC-14). Each module documents its own routes
 * (EF-DOC-01).
 */
export interface ApiModule {
  router: Router;
  isPublic?: boolean;
  registerDocs: (registry: OpenAPIRegistry) => void;
}
