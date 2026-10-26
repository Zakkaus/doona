import {afterEach, expect, test, vi} from 'vitest';

const loads = vi.hoisted(() => ({mock: 0}));
vi.mock('../src/demo/createMockApi', () => {
  loads.mock++;
  return {createMockApi: () => {}};
});

afterEach(() => vi.unstubAllGlobals());

test('the sign-in page does not load the demo mock while idle', async () => {
  const idle: Array<() => void> = [];
  vi.stubGlobal('window', {requestIdleCallback: (run: () => void) => idle.push(run), setTimeout});
  vi.stubGlobal('document', {fonts: {ready: Promise.resolve()}, querySelector: () => null});
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => (run(), 0));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('cancelIdleCallback', () => {});
  const {warmGlyphsDuringIdle} = await import('../src/preload');
  const stop = warmGlyphsDuringIdle('Loading');
  for (let quiet = 0; quiet < 20 && !loads.mock;) {
    await new Promise(resolve => setTimeout(resolve, 5));
    const run = idle.shift();
    if (run) {
      quiet = 0;
      run();
    } else quiet++;
  }
  stop();
  expect(loads.mock).toBe(0);
});
