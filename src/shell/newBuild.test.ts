import {describe, expect, it, vi} from 'vitest';
import {announceBuild, workerBuild} from './newBuild';

// An activated worker that answers the build question with `build`, or never when it is undefined.
function worker(build?: string) {
  const fake = {
    state: 'activated',
    addEventListener: () => undefined,
    postMessage: (_: unknown, [port]: MessagePort[]) => {
      if (build !== undefined) port.postMessage(build);
    }
  };
  return fake as unknown as ServiceWorker;
}
const container = (controller: ServiceWorker) => ({controller}) as ServiceWorkerContainer;

describe('announceBuild', () => {
  it('stays silent for a worker of the page’s own build', async () => {
    const offer = vi.fn();
    const same = worker('a');
    await announceBuild(same, container(same), 'a', () => Promise.resolve(), offer);
    expect(offer).not.toHaveBeenCalled();
  });

  it('offers a reload for a worker of another build', async () => {
    const offer = vi.fn();
    const other = worker('b');
    await announceBuild(other, container(other), 'a', () => Promise.resolve(), offer);
    expect(offer).toHaveBeenCalledOnce();
  });

  it('offers a reload for a worker that does not report its build', async () => {
    const offer = vi.fn();
    const old = worker();
    await announceBuild(old, container(old), 'a', () => Promise.resolve(), offer, 20);
    expect(offer).toHaveBeenCalledOnce();
  });

  it('drops the offer when another worker takes over while the page waits', async () => {
    const offer = vi.fn();
    const first = worker('b');
    const pages = container(first);
    let loaded!: () => void;
    const ready = new Promise<void>(resolve => (loaded = resolve));
    let asked!: () => void;
    const waiting = new Promise<void>(resolve => (asked = resolve));
    const announced = announceBuild(
      first,
      pages,
      'a',
      () => {
        asked();
        return ready;
      },
      offer
    );
    await waiting;
    // A worker of the page's own build replaces the first one before the catalogue loads.
    (pages as {controller: ServiceWorker}).controller = worker('a');
    loaded();
    await announced;
    expect(offer).not.toHaveBeenCalled();
  });
});

describe('workerBuild', () => {
  it('answers null when the worker stays silent', async () => {
    expect(await workerBuild(worker(), 20)).toBeNull();
  });
});
