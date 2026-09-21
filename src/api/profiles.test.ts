import {expect, it, vi} from 'vitest';
import {detectHostedBackend} from './profiles';

it('continues startup when accessing browser storage throws', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('Storage denied');
    }
  });
  const fetcher = vi.fn();
  try {
    await expect(
      detectHostedBackend(undefined, {origin: 'https://honk.example', pathname: '/ui/', protocol: 'https:', host: 'honk.example'}, fetcher)
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
