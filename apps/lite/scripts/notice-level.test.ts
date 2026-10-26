import {describe, expect, it} from 'vitest';
import {ApiError} from '../../../src/api/error';
import {LiteError} from '../src/api';
import {noticeLevel} from '../src/ui';

describe('write result levels', () => {
  it('treats an unconfirmed write as a warning even when it arrives as an error', () => {
    expect(noticeLevel({error: new LiteError('unknownOutcome')}).level).toBe('warning');
    expect(noticeLevel({error: new LiteError('writtenNotRead')}).level).toBe('warning');
  });

  it('treats a partial refresh as a warning from its key alone', () => {
    expect(noticeLevel({key: 'refreshPartial'})).toEqual({key: 'refreshPartial', level: 'warning'});
    expect(noticeLevel({key: 'degraded'}).level).toBe('warning');
  });

  it('keeps refused writes as errors and finished ones as success', () => {
    expect(noticeLevel({error: new ApiError(412, 'precondition_failed', 'stale')}).level).toBe('error');
    expect(noticeLevel({key: 'changesSaved'}).level).toBe('success');
  });
});
