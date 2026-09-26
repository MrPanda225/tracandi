const PARIS = 'Europe/Paris';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

const parisClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Midnight of the current day in Paris, as an instant: the time elapsed since then is read on Paris's clock, which
 * accounts for summer and winter time.
 * @req EF-CVX-33
 */
export const startOfParisDay = (now: Date): Date => {
  const parts = Object.fromEntries(parisClock.formatToParts(now).map((part) => [part.type, part.value]));
  const secondsToday =
    (Number(parts['hour']) * MINUTES_PER_HOUR + Number(parts['minute'])) * SECONDS_PER_MINUTE + Number(parts['second']);
  return new Date(now.getTime() - secondsToday * MS_PER_SECOND - now.getUTCMilliseconds());
};
