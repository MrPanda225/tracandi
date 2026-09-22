import { defineConfig } from 'drizzle-kit';

// Generation only (`npx drizzle-kit generate`): no database connection is needed.
// Migrations are applied by src/db/migrate.ts with the owner role; `drizzle-kit push` is forbidden (ADR-03).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
});
