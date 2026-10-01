import {expect, it, vi} from 'vitest';
import {loadSamples} from './samples';
import {hasPreviewData} from './preview';
it('derives reusable preview snapshots without browser storage, network calls or timers', async () => {
  const storage = {getItem: vi.fn(() => '100000'), setItem: vi.fn(), removeItem: vi.fn()};
  vi.stubGlobal('localStorage', storage);
  const fetch = vi.spyOn(globalThis, 'fetch');
  const interval = vi.spyOn(globalThis, 'setInterval');
  try {
    const pending = loadSamples();
    expect(loadSamples()).toBe(pending);
    const samples = await pending;
    for (const [name, value] of Object.entries(samples)) expect(hasPreviewData(value), name).toBe(true);
    expect(samples.nodes).toHaveLength(8);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    interval.mockRestore();
    vi.unstubAllGlobals();
  }
});
