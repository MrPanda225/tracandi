import '@testing-library/jest-dom/vitest';

// jsdom lacks these browser APIs used by the animated components.
// Reduced motion is reported, so every anime.js animation is skipped and states render instantly.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

// Used by `motion` to start an animation when its element scrolls into view; nothing ever scrolls in jsdom.
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub;

HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

/**
 * jsdom n'a pas `EventSource`, dont l'interface se sert pour suivre les exécutions (EF-EXE-04). Le double garde
 * les flux ouverts : un test qui veut pousser un événement appelle `openStreams`.
 */
export const openStreams: { url: string; emit: (event: string, data: unknown) => void }[] = [];

class EventSourceStub {
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    openStreams.push({
      url,
      emit: (event, data) => {
        const message = new MessageEvent(event, { data: JSON.stringify(data) });
        for (const listener of this.listeners.get(event) ?? []) listener(message);
      },
    });
  }

  addEventListener(event: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  close() {
    const at = openStreams.findIndex((stream) => stream.url === this.url);
    if (at >= 0) openStreams.splice(at, 1);
  }
}

globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;
