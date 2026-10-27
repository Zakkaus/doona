import {connect, type Connection} from './api';
import type {StoredConnection} from './connectionStore';
import type {SignIn} from '../../../src/api/auth';
import {ApiError} from '../../../src/api/error';
import {probeHostedBackend} from '../../../src/api/profiles';
import {resolveSignInKind} from '../../../src/shell/useLogin';

type Startup = {connection: Connection} | {address: string; kind: SignIn | 'no-api'} | null;

export async function connectionStartup(
  saved: StoredConnection | null,
  demo: boolean,
  loc: Pick<Location, 'origin' | 'pathname' | 'protocol'>
): Promise<Startup> {
  if (demo || saved?.address === 'mock') return null;
  if (saved) return {connection: await connect(saved.address, saved.token)};
  const address = await probeHostedBackend(loc);
  if (address === null) return null;
  try {
    return {connection: await connect(address, '')};
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
    return {address, kind: await resolveSignInKind(address)};
  }
}
