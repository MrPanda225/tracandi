import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { AutomaticWatch, AutomaticWatchPass, WatchSlot } from '../../../api/autowatch';
import type { RunState } from '../../../api/jobs';
import { ROUTER_FUTURE } from '../../../lib/router';
import { openStreams } from '../../../test/setup';
import { WatchSettings } from './WatchSettings';

/** What the tests of the « Veille automatique » section share: a mocked API, the stream of runs, the render. */

export const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export interface ApiCall {
  key: string;
  body: unknown;
}

type Route = (body: unknown) => Response | Promise<Response>;

/** Every panel of the section reads its own list when it appears: a test overrides only the ones it is about. */
const EMPTY_SECTION: Record<string, Route> = {
  'GET /cv-types': () => json(200, { items: [], maxItems: 4 }),
  'GET /watch/criteria': () => json(200, { criteria: null }),
  'GET /chosen-offers': () => json(200, { items: [], maxPerLevel: 3 }),
  'GET /watch/automatic': () => json(200, automaticWatch()),
};

/** Answers `METHOD /path` (without `/api`, without the query) with the route's response; anything else is a 404. */
export const mockApi = (routes: Record<string, Route>) => {
  const calls: ApiCall[] = [];
  const answers = { ...EMPTY_SECTION, ...routes };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.replace(/^\/api/, '').split('?')[0] ?? ''}`;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ key, body });
      const route = answers[key];
      return Promise.resolve(route ? route(body) : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return calls;
};

/** The bodies sent to a route, in order. */
export const bodiesOf = (calls: readonly ApiCall[], key: string): unknown[] =>
  calls.filter((call) => call.key === key).map((call) => call.body);

export const keysOf = (calls: readonly ApiCall[]): string[] => calls.map((call) => call.key);

/** Pushes a change of state of an execution through every open stream, as the API does (EF-EXE-04). */
export const emitRun = (run: Pick<RunState, 'id' | 'job' | 'outcome'> & Partial<RunState>) => {
  act(() => {
    for (const stream of openStreams.filter((open) => open.url.endsWith('/jobs/stream'))) {
      stream.emit('run', { trigger: 'manual', counters: {}, error: null, ...run });
    }
  });
};

export const renderSection = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <WatchSettings />
    </MemoryRouter>,
  );

export const CV_TYPE = {
  id: 1,
  label: 'Data analyst',
  years: 4,
  level: 'confirme',
  deductionReady: false,
  createdAt: '2026-10-02T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

export const cvTypes = (...items: object[]) => json(200, { items, maxItems: 4 });

/** The watch as the API answers it: on, the three slots ticked, no pass yet today. */
export const automaticWatch = (changes: Partial<AutomaticWatch> = {}): AutomaticWatch => ({
  enabled: true,
  slots: ['morning', 'noon', 'evening'],
  lastSuccessAt: null,
  passes: [],
  ...changes,
});

/** A scheduled pass of today as the API lists it; it ended at 7 h 12 (Paris) unless it is still going. */
export const pass = (
  slot: WatchSlot,
  outcome: AutomaticWatchPass['outcome'],
  changes: Partial<AutomaticWatchPass> = {},
): AutomaticWatchPass => ({
  slot,
  outcome,
  startedAt: '2026-10-02T05:00:00.000Z',
  finishedAt: outcome === 'queued' || outcome === 'running' ? null : '2026-10-02T05:12:00.000Z',
  counters: {},
  message: null,
  ledBy: null,
  ...changes,
});

/** A PDF small enough to read in a test; its bytes are `%PDF-1.4 test`. */
export const pdfFile = (name = 'cv.pdf') => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });
export const PDF_BASE64 = btoa('%PDF-1.4 test');
