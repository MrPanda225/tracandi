import { describe, expect, it } from 'vitest';
import { describeAssignments } from './assignments.js';

describe('describeAssignments', () => {
  it('[EF-CFG-02] lists the configured providers and, for each task, the providers that serve it in order', () => {
    expect(
      describeAssignments({
        claude: { model: 'claude-sonnet-5' },
        gemini: { model: 'gemini-3.6-flash' },
        groq_1: { model: 'openai/gpt-oss-120b' },
        groq_3: { model: 'openai/gpt-oss-20b' },
      }),
    ).toEqual({
      providers: [
        { name: 'groq_1', model: 'openai/gpt-oss-120b' },
        { name: 'groq_3', model: 'openai/gpt-oss-20b' },
        { name: 'gemini', model: 'gemini-3.6-flash' },
        { name: 'claude', model: 'claude-sonnet-5' },
      ],
      // RG-13 (v1.8); the second Groq slot, left empty, is left out of the routing.
      tasks: [
        { task: 'classify_emails', providers: ['groq_1', 'groq_3', 'gemini', 'claude'] },
        { task: 'score_offers', providers: ['groq_1', 'groq_3', 'gemini', 'claude'] },
        { task: 'extract_offers', providers: ['groq_1', 'groq_3', 'gemini', 'claude'] },
        { task: 'tailor_cv', providers: ['groq_1', 'groq_3', 'claude', 'gemini'] },
        { task: 'write_motivation', providers: ['groq_1', 'groq_3', 'claude', 'gemini'] },
        { task: 'write_follow_up', providers: ['groq_1', 'groq_3', 'claude', 'gemini'] },
        { task: 'diagnose_cv', providers: ['groq_1', 'groq_3', 'gemini', 'claude'] },
      ],
    });
  });

  it('[EF-CFG-02] [ENF-SEC-08] never carries an API key, even when given the full configuration', () => {
    const configured = { claude: { apiKey: 'sk-ant-secret-value', model: 'claude-sonnet-5' } };

    expect(JSON.stringify(describeAssignments(configured))).not.toContain('sk-ant-secret-value');
  });

  it('[EF-CFG-02] [EF-IA-05] gives every task to the only configured provider', () => {
    const { providers, tasks } = describeAssignments({ gemini: { model: 'gemini-3.6-flash' } });

    expect(providers).toEqual([{ name: 'gemini', model: 'gemini-3.6-flash' }]);
    expect(tasks.every((task) => task.providers.join() === 'gemini')).toBe(true);
  });

  it('[EF-IA-07] [ENF-SEC-25] lists the local model with its name only, never its address nor its token, and routes no task to it yet', () => {
    const configured = {
      local: {
        apiKey: 'local-secret-token',
        model: 'qwen3.5:4b',
        baseUrl: 'http://192.168.1.54:11434/v1',
      },
      gemini: { model: 'gemini-3.6-flash' },
    };

    const assignments = describeAssignments(configured);

    expect(assignments.providers).toEqual([
      { name: 'local', model: 'qwen3.5:4b' },
      { name: 'gemini', model: 'gemini-3.6-flash' },
    ]);
    // T-1001: no route cites the local model before T-1003 (RG-13 v1.35).
    expect(assignments.tasks.every((task) => !task.providers.includes('local'))).toBe(true);
    expect(JSON.stringify(assignments)).not.toMatch(/local-secret-token|192\.168\.1\.54/);
  });
});
