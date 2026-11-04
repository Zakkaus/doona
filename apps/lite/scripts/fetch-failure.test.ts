import {describe, expect, it} from 'vitest';
import type {Provider} from '../../../src/api/model';
import {fetchFailureText} from '../src/fetchFailure';
import {en} from '../src/i18n/en';
import {zhCN} from '../src/i18n/zh-CN';
import {zhTW} from '../src/i18n/zh-TW';

const error = (code: string, details?: unknown): NonNullable<Provider['last_error']> => ({
  code,
  message: 'Provider refresh did not complete successfully.',
  details: details as Record<string, never> | null
});

describe('why a subscription update failed', () => {
  it.each([en, zhTW, zhCN])('words every stage in the interface language', messages => {
    const stages = [
      'connection_failed',
      'download_timeout',
      'tls_failed',
      'http_status_rejected',
      'http_not_found',
      'route_blocked',
      'asset_too_large',
      'parse_failed'
    ];
    const texts = stages.map(stage => fetchFailureText(error('fetch_failed', {stage, node: null, group_id: null}), messages));
    expect(new Set(texts).size).toBe(stages.length);
    for (const text of texts) expect(text).not.toBe(messages.fetchFailed);
  });

  it('puts the stage in Traditional Chinese for zh-TW', () => {
    expect(fetchFailureText(error('fetch_failed', {stage: 'parse_failed', node: 'hk-01', group_id: 'g1'}), zhTW)).toBe(zhTW.fetchStageParse);
    expect(zhTW.fetchStageParse).toContain('無法解析出節點');
  });

  it('keeps the plain text for an engine that sends no stage', () => {
    for (const details of [undefined, null, {}, {stage: 'new_stage'}]) {
      expect(fetchFailureText(error('fetch_failed', details), en)).toBe(en.fetchFailed);
    }
  });

  it('words route_unavailable and passes any other code through', () => {
    expect(fetchFailureText(error('route_unavailable'), zhTW)).toBe(zhTW.routeUnavailable);
    expect(fetchFailureText(error('provider_replaced'), en)).toBe('Provider refresh did not complete successfully.');
  });
});
