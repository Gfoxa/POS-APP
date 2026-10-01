const URL_SETTING = "ANDROID_POS_URL";

const invalidUrlMessage =
  `${URL_SETTING} must be an origin-only HTTP(S) URL reachable from the Android device.`;

function expandIpv6Address(address: string): number[] | undefined {
  const ipv4Tail = address.match(/(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)?.[1];
  if (ipv4Tail) {
    const octets = ipv4Tail.split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return undefined;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, address.length - ipv4Tail.length)}${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missingGroups = 8 - left.length - right.length;
  if (missingGroups < 0 || (halves.length === 1 && missingGroups !== 0)) return undefined;

  const groups = [...left, ...Array(missingGroups).fill("0"), ...right].map((group) => Number.parseInt(group || "0", 16));
  return groups.length === 8 && groups.every(Number.isInteger) ? groups : undefined;
}

function isLoopbackOrWildcardHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.startsWith("127.") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  if (host.includes(":")) {
    const groups = expandIpv6Address(host);
    if (!groups) return false;

    const firstSevenAreZero = groups.slice(0, 7).every((group) => group === 0);
    if ((firstSevenAreZero && groups[7] === 1) || groups.every((group) => group === 0)) return true;

    const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    if (isIpv4Mapped) {
      const firstIpv4Octet = groups[6] >> 8;
      return firstIpv4Octet === 0 || firstIpv4Octet === 127;
    }
  }

  return false;
}

export function parseAndroidPosUrl(value: string | undefined): string {
  const input = value?.trim();
  if (!input) {
    throw new Error(`${URL_SETTING} is required to configure the Android app's POS server.`);
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(invalidUrlMessage);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${URL_SETTING} must use HTTP or HTTPS.`);
  }

  if (!url.hostname) {
    throw new Error(invalidUrlMessage);
  }

  if (url.username || url.password) {
    throw new Error(`${URL_SETTING} must not contain a username or password.`);
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${URL_SETTING} must contain only the origin, with no path, query, or fragment.`);
  }

  if (isLoopbackOrWildcardHost(url.hostname)) {
    throw new Error(`${URL_SETTING} host must be reachable from the Android device, not localhost or a loopback/wildcard address.`);
  }

  return url.origin;
}
