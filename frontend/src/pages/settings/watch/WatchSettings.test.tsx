import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStreams } from '../../../test/setup';
import { CV_TYPE, cvTypes, mockApi, renderSection } from './testApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WatchSettings — the section « Veille automatique » (EF-CFG-06)', () => {
  it('[EF-CFG-06] groups the CV types, the deduced profile and the offers chosen by level', async () => {
    mockApi({});

    renderSection();
    const section = await screen.findByRole('region', { name: 'Veille automatique' });

    expect(
      within(section).getByRole('heading', { level: 2, name: 'Veille automatique' }),
    ).toBeInTheDocument();
    expect(within(section).getByRole('region', { name: 'CV types' })).toBeInTheDocument();
    expect(within(section).getByRole('region', { name: 'Profil déduit à valider' })).toBeInTheDocument();
    expect(within(section).getByRole('region', { name: 'Offres choisies par niveau' })).toBeInTheDocument();
  });

  it('[EF-CFG-06] shows no address of a model, no token and no server setting', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes({ ...CV_TYPE, deductionReady: false }) });

    renderSection();
    const section = await screen.findByRole('region', { name: 'Veille automatique' });
    await within(section).findByRole('list', { name: 'Vos CV types' });

    expect(section.textContent).not.toMatch(
      /https?:\/\/|localhost|jeton|token|clé d’api|api[_ ]key|LOCAL_LLM|ollama/iu,
    );
  });

  it('[EF-EXE-04] opens one stream of executions for the whole section, whatever the panels that follow a run', async () => {
    mockApi({});

    renderSection();
    await screen.findByRole('region', { name: 'Veille automatique' });

    expect(openStreams.filter((stream) => stream.url.endsWith('/jobs/stream'))).toHaveLength(1);
  });
});
