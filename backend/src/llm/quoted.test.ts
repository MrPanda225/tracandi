import { describe, expect, it } from 'vitest';
import { QUOTED_REQUEST, withoutQuotedRequest } from './quoted.js';

const PROMPT =
  'Camille Durand, Data Analyst chez Atelier Nova, a conçu des tableaux de bord Power BI pour douze équipes.';

describe('withoutQuotedRequest', () => {
  it('[ENF-RGP-12] keeps the failure of a provider that says nothing of the request, as it is', () => {
    const outage = Object.assign(new Error('401 invalid x-api-key'), { status: 401 });

    expect(withoutQuotedRequest(outage, [PROMPT])).toBe(outage);
  });

  it('[ENF-RGP-12] withholds a message that quotes the prompt, keeping the kind of failure and its status', () => {
    const quoting = Object.assign(new Error(`400 invalid JSON near: ${PROMPT}`), { status: 400 });

    const safe = withoutQuotedRequest(quoting, [PROMPT]) as Error & { status: number };

    expect(safe.message).toBe(QUOTED_REQUEST);
    expect(safe.name).toBe('Error');
    expect(safe.status).toBe(400);
  });

  it('[ENF-RGP-12] withholds a message that quotes only a piece of the prompt, taken from its middle', () => {
    const piece = PROMPT.slice(30, 75);

    const safe = withoutQuotedRequest(new Error(`unexpected token at "${piece}"`), ['x'.repeat(50), PROMPT]);

    expect((safe as Error).message).toBe(QUOTED_REQUEST);
  });

  it('[ENF-RGP-12] lets a short message through even when its words are in the prompt: « Data Analyst » is no quote', () => {
    const short = new Error('model Data Analyst not found');

    expect(withoutQuotedRequest(short, [PROMPT])).toBe(short);
  });

  it('[ENF-RGP-12] withholds nothing from a failure that is no Error object, which the logger writes as it is', () => {
    expect(withoutQuotedRequest('connection reset', [PROMPT])).toBe('connection reset');
    expect(withoutQuotedRequest(undefined, [PROMPT])).toBeUndefined();
  });
});
