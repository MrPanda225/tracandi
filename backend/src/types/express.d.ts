declare global {
  namespace Express {
    interface Locals {
      /** Authenticated user, set by the session guard (EF-AUT-05); absent on public routes. */
      userId?: number;
    }
  }
}

export {};
