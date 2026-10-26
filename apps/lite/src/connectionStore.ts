export type StoredConnection = {address: string; token: string};
const key = 'doona-lite.connection';

export function readConnection(): StoredConnection | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object' && 'address' in value && typeof value.address === 'string' && 'token' in value && typeof value.token === 'string') {
      return {address: value.address, token: value.token};
    }
  } catch {
    // A blocked or damaged store leaves the sign-in form available.
  }
  return null;
}

export function writeConnection(connection: StoredConnection) {
  localStorage.setItem(key, JSON.stringify(connection));
}

export function clearConnection(expected: StoredConnection) {
  const current = readConnection();
  if (current?.address === expected.address && current.token === expected.token) localStorage.removeItem(key);
}
