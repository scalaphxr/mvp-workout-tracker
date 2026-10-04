/**
 * Loads the catalog seed into a running API: `pnpm catalog:import`.
 * `API_URL` and `ADMIN_TOKEN` default to the local development server.
 */
import { catalogSeed } from '../src/index';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
const adminToken = process.env.ADMIN_TOKEN ?? 'dev-admin-token';

const response = await fetch(`${apiUrl}/v1/admin/catalog/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify(catalogSeed),
});
const body: unknown = await response.json();

if (!response.ok) {
  console.error(`Import failed (HTTP ${response.status}):`, body);
  process.exit(1);
}

const { version, changed } = body as { version: number; changed: boolean };
console.log(
  changed
    ? `Catalog imported: ${catalogSeed.exercises.length} exercises, version ${version}`
    : `Nothing changed: the server already has this catalog (version ${version})`,
);
