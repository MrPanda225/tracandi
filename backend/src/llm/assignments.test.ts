import { describe, expect, it } from 'vitest';
import { describeAssignments } from './assignments.js';

describe('describeAssignments', () => {
  it('[EF-CFG-02] lists the configured providers and, for each task, the providers that serve it in order', () => {
    expect(
      describeAssignments({ claude: { model: 'claude-sonnet-5' }, gemini: { model: 'gemini-2.5-flash' } }),
    ).toEqual({
      providers: [
        { name: 'claude', model: 'claude-sonnet-5' },
        { name: 'gemini', model: 'gemini-2.5-flash' },
      ],
      tasks: [
        { task: 'classify_emails', providers: ['gemini', 'claude'] },
        { task: 'score_offers', providers: ['gemini', 'claude'] },
        { task: 'extract_offers', providers: ['gemini', 'claude'] },
        { task: 'tailor_cv', providers: ['claude', 'gemini'] },
        { task: 'write_motivation', providers: ['claude', 'gemini'] },
      ],
    });
  });

  it('[EF-CFG-02] [ENF-SEC-08] never carries an API key, even when given the full configuration', () => {
    const configured = { claude: { apiKey: 'sk-ant-secret-value', model: 'claude-sonnet-5' } };

    expect(JSON.stringify(describeAssignments(configured))).not.toContain('sk-ant-secret-value');
  });

  it('[EF-CFG-02] [EF-IA-05] gives every task to the only configured provider', () => {
    const { providers, tasks } = describeAssignments({ gemini: { model: 'gemini-2.5-flash' } });

    expect(providers).toEqual([{ name: 'gemini', model: 'gemini-2.5-flash' }]);
    expect(tasks.every((task) => task.providers.join() === 'gemini')).toBe(true);
  });
});
