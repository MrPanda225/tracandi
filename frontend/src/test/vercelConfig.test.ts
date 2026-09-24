import { describe, expect, it } from 'vitest';
import vercelJson from '../../vercel.json?raw';

interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const config = JSON.parse(vercelJson) as VercelConfig;
const headersOf = (source: string) =>
  Object.fromEntries(
    (config.headers.find((entry) => entry.source === source)?.headers ?? []).map((h) => [h.key, h.value]),
  );

describe('vercel.json (BES-39)', () => {
  it('[BES-39] relays /api to the API before any page falls back to the application', () => {
    expect(config.rewrites.map((rewrite) => rewrite.source)).toEqual(['/api/:path*', '/(.*)']);
    expect(config.rewrites[0]?.destination).toMatch(/^https:\/\/[^/]+\/api\/:path\*$/);
    expect(config.rewrites[1]?.destination).toBe('/index.html');
  });

  it('[ENF-SEC-11] [ENF-RGP-04] keeps every call on the same origin and loads nothing from elsewhere', () => {
    const policy = headersOf('/(.*)')['Content-Security-Policy'] ?? '';

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it('[BES-39] sends the security headers on every page', () => {
    const headers = headersOf('/(.*)');

    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d{8}/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('[ENF-PERF-01] caches the hashed assets for a year, never the page that names them', () => {
    expect(headersOf('/assets/(.*)')['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(headersOf('/index.html')['Cache-Control']).toBe('no-cache');
  });
});
