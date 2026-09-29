import {expect, it} from 'vitest';
import {ApiError} from '../api/error';
import {translate} from '../i18n';
import {toastErrorDetail} from './Feedback';

it('passes the request ID separately from translated toast detail', () => {
  const error = new ApiError(502, 'upstream_unavailable', 'Upstream (proxy) unreachable', 'request-42');
  for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params);
    const detail = toastErrorDetail(error, t);
    expect(detail.requestId).toBe('request-42');
    expect(detail.detail).toContain('Upstream (proxy) unreachable');
    expect(detail.detail).not.toContain('request-42');
  }
});
