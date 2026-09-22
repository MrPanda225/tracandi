/** Current instant provider, injected so that time-based rules are testable (testing.md). */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
