/** Names a private network gives its own hosts (loopback, local DNS zones, RFC 8375). */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.home.arpa'] as const;
const IPV4_PART = /^\d{1,3}$/;
const IPV4_PARTS = 4;
const MAX_OCTET = 255;

const parseIpv4 = (host: string): [number, number, number, number] | null => {
  const parts = host.split('.');
  if (parts.length !== IPV4_PARTS) return null;
  const octets = parts.map((part) => (IPV4_PART.test(part) ? Number(part) : Number.NaN));
  if (!octets.every((octet) => octet >= 0 && octet <= MAX_OCTET)) return null;
  return octets as [number, number, number, number];
};

/** Loopback, RFC 1918, link-local and the shared range 100.64.0.0/10 that Tailscale uses: [first, second min, max]. */
const PRIVATE_IPV4_RANGES: readonly [number, number, number][] = [
  [10, 0, 255],
  [127, 0, 255],
  [169, 254, 254],
  [192, 168, 168],
  [172, 16, 31],
  [100, 64, 127],
];

const isPrivateIpv4 = ([first, second]: [number, number, number, number]): boolean =>
  PRIVATE_IPV4_RANGES.some(([range, low, high]) => first === range && second >= low && second <= high);

/** Loopback `::1`, unique local `fc00::/7` and link-local `fe80::/10`. */
const isPrivateIpv6 = (host: string): boolean =>
  host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);

/**
 * Whether a host name, as `URL.hostname` gives it, designates a machine on a private network: loopback, a private
 * IPv4 or IPv6 address, or a name in a local zone (`.lan`, `.local`, `.internal`, `.home.arpa`, `localhost`).
 * No name resolution happens: a public name is never read as private, whatever it resolves to.
 * @req ENF-SEC-24
 */
export const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === '') return false;
  if (host.startsWith('[') && host.endsWith(']')) return isPrivateIpv6(host.slice(1, -1));
  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateIpv4(ipv4);
  return host === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
};
