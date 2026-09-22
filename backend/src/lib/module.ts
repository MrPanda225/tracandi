import type { Router } from 'express';
import type { OpenAPIRegistry } from './openapi.js';

/**
 * A feature plugged into `/api` by createApp. Protected modules are mounted behind the session guard (EF-AUT-05);
 * `isPublic` is reserved to account creation, login and logout. Each module documents its own routes (EF-DOC-01).
 */
export interface ApiModule {
  router: Router;
  isPublic?: boolean;
  registerDocs: (registry: OpenAPIRegistry) => void;
}
