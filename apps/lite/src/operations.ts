import type {Api} from '../../../src/api/api';
import type {Operation, OperationAccepted, OperationState} from '../../../src/api/model';
import {ApiError, LocalError} from '../../../src/api/error';
import {waitOutRefusal} from '../../../src/api/refusal';

// Mirror store/action without its global resource cache and backend singleton.
export async function settle(api: Api, accepted: OperationAccepted): Promise<OperationState> {
  try {
    return await api.pollOperation(accepted);
  } catch {
    throw new LocalError('ui.operationUnknown');
  }
}

export const etag = (revision: string) => `"${revision}"`;

type Succeeded<K extends Operation['kind']> = Extract<Operation, {kind: K; status: 'succeeded'}>['result'];
type Finished<K extends Operation['kind']> = K extends 'provider_refresh' ? Succeeded<K> | {degraded: true} : Succeeded<K>;
export function finished<K extends Operation['kind']>(operation: OperationState, kind: K, {written = false} = {}): Finished<K> {
  if (operation.status === 'succeeded' && operation.kind === kind) return operation.result as Finished<K>;
  const details = operation.error?.details as {written?: boolean; committed?: boolean} | null;
  if (operation.status === 'failed' && operation.kind === kind && kind === 'provider_refresh' && details?.committed === true) {
    return {degraded: true} as Finished<K>;
  }
  if (operation.status === 'failed') {
    const activation = activationError(operation.error, {written});
    if (activation) throw activation;
  }
  throw new LocalError(operation.status === 'failed' && (details?.written ?? written) ? 'ui.writtenNotApplied' : 'ui.operationFailed');
}

export function activationError(failure: unknown, {written = false} = {}): LocalError | null {
  const {code, details} = (failure ?? {}) as {code?: string; details?: unknown};
  const outcome = details as {written?: boolean; committed?: boolean | null; durability_confirmed?: boolean; stage?: string} | null;
  if (!outcome || (outcome.committed !== true && outcome.committed !== null)) return null;
  const stage = failure instanceof ApiError ? outcome.stage : code;
  return new LocalError(
    outcome.committed === null
      ? 'ui.activationUnknown'
      : stage === 'store_unavailable'
        ? 'ui.activationNotSaved'
        : outcome.durability_confirmed === false
          ? 'ui.activationDegradedUnconfirmed'
          : (outcome.written ?? written)
            ? 'ui.activationDegradedSaved'
            : 'ui.activationDegraded'
  );
}

export const readBackUnconfirmed =
  (reread: () => Promise<unknown>) =>
  async (error: unknown): Promise<never> => {
    if (error instanceof ApiError && error.status === 503 && error.code === 'temporarily_unavailable') {
      await Promise.all([reread().catch(() => {}), error.retryAfter && waitOutRefusal(503, error.retryAfter)]);
    }
    throw error;
  };
