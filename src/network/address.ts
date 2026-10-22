// The address a guest types may carry the port, as some host screens show it.
// People also paste a whole URL, so the scheme and any path are dropped instead
// of being handed to the socket. A bare host or IP keeps the fallback port. An
// unbracketed address with two colons is an IPv6 address, not a host and a
// port, and a bracketed one is the same address with its optional port.
const BRACKETED = /^\[([^\]]+)\](?::(\d+))?$/;

export const splitHostAddress = (
  address: string,
  fallback: number,
): { host: string; port: number } => {
  const typed = address
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  const bracketed = BRACKETED.exec(typed);
  if (bracketed) {
    return {
      host: bracketed[1],
      port: bracketed[2] ? Number(bracketed[2]) : fallback,
    };
  }

  const match = /^(.+):(\d+)$/.exec(typed);
  if (!match || match[1].includes(':')) {
    return { host: typed, port: fallback };
  }

  return { host: match[1], port: Number(match[2]) };
};
