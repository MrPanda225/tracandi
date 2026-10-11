import { z } from 'zod';

/** The largest identifier the database holds: its `integer` columns stop there. */
export const INT4_MAX = 2_147_483_647;

/**
 * An identifier taken from an address: a whole number from 1 up to what the database can hold. One beyond it is no
 * resource that could exist and is refused here with a 400, not by the database with a 500.
 */
export const idParam = () => z.coerce.number().int().positive().max(INT4_MAX);
