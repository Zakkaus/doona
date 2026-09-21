export type Profile = {id: string; name: string; api: string; token: string};
export type Profiles = {profiles: Profile[]; activeId: string};
export type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Accept a server root or proxy prefix, never credentials, a query, or a fragment. */
export function normalizeApi(value: string): string {
  const base = value.trim();
  if (!base || base === 'mock') return base;
  if (!/^https?:\/\/[^/]+/i.test(base) || /[\s\\?#]/.test(base)) throw new Error('invalid_url');
  const url = new URL(base);
  if (!url.hostname || url.username || url.password) throw new Error('invalid_url');
  return base.replace(/\/+$/, '');
}

export function normalizeProfiles(value: unknown): Profile[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || typeof item.api !== 'string') return [];
    try {
      const api = normalizeApi(item.api);
      ids.add(item.id);
      return [
        {
          id: item.id,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : api || item.id,
          api,
          token: typeof item.token === 'string' ? item.token : ''
        }
      ];
    } catch {
      return [];
    }
  });
}

let cachedProfiles: {raw: string; profiles: Profile[]} | undefined;

export function readProfiles(storage?: StoragePort): Profiles {
  try {
    const store = storage ?? localStorage;
    let raw = store.getItem('doona-profiles');
    // Preserve first-visit state until a profile is explicitly written.
    if (raw === null && store.getItem('doona-api') === null) raw = '[]';
    else if (raw === null) {
      const api = store.getItem('doona-api')!;
      const token = store.getItem('doona-api-token') ?? '';
      const profiles = normalizeProfiles([{id: 'legacy', name: api.trim() || 'mock', api, token}]);
      raw = JSON.stringify(profiles);
      // Commit the migration marker before removing the old credentials.
      store.setItem('doona-profiles', raw);
      store.setItem('doona-profile', profiles[0]?.id ?? '');
      store.removeItem('doona-api');
      store.removeItem('doona-api-token');
    }
    if (cachedProfiles?.raw !== raw) cachedProfiles = {raw, profiles: normalizeProfiles(JSON.parse(raw))};
    const profiles = cachedProfiles.profiles;
    const id = store.getItem('doona-profile');
    return {profiles, activeId: profiles.find(profile => profile.id === id)?.id ?? profiles[0]?.id ?? ''};
  } catch {
    return {profiles: [], activeId: ''};
  }
}

export function writeProfiles({profiles, activeId}: Profiles, storage: StoragePort = localStorage): void {
  const normalized = profiles.map(profile => ({...profile, name: profile.name.trim() || profile.id, api: normalizeApi(profile.api)}));
  storage.setItem('doona-profiles', JSON.stringify(normalized));
  storage.setItem('doona-profile', normalized.find(profile => profile.id === activeId)?.id ?? normalized[0]?.id ?? '');
}

// Strip the hosted /ui/ suffix while preserving any reverse-proxy prefix.
export function hostedRoot(loc: {origin: string; pathname: string}): string {
  const prefix = /^(.*?)\/ui(?:\/|$)/.exec(loc.pathname)?.[1] ?? '';
  return loc.origin + prefix;
}

export async function detectHostedBackend(
  storage: StoragePort = localStorage,
  loc: {origin: string; pathname: string; protocol: string; host: string} = location,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  try {
    if (storage.getItem('doona-profiles') !== null || storage.getItem('doona-api') !== null || !/^https?:$/.test(loc.protocol)) return false;
    const api = hostedRoot(loc);
    const response = await fetcher(`${api}/api`, {headers: {Accept: 'application/json'}, cache: 'no-store', signal: AbortSignal.timeout(3000)});
    const json = response.headers.get('content-type')?.includes('application/json') ?? false;
    const challenged = response.status === 401 && /bearer/i.test(response.headers.get('www-authenticate') ?? '');
    const discovered = response.status === 200 && json && (await response.json())?.api_major === 1;
    if (!challenged && !discovered) return false;
    writeProfiles({profiles: [{id: 'hosted', name: loc.host, api, token: ''}], activeId: 'hosted'}, storage);
    return true;
  } catch {
    return false;
  }
}
