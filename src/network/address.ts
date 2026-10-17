// The address a guest types may carry the port, as some host screens show it.
// A bare host or IP keeps the fallback port. An unbracketed address with two
// colons is an IPv6 address, not a host and a port.
export const splitHostAddress = (
  address: string,
  fallback: number,
): { host: string; port: number } => {
  const typed = address.trim();
  const match = /^(.+):(\d+)$/.exec(typed);
  if (!match || (!match[1].startsWith('[') && match[1].includes(':'))) {
    return { host: typed, port: fallback };
  }

  return { host: match[1], port: Number(match[2]) };
};
