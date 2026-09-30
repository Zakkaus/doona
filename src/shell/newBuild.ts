// How long a worker has to report its build. One from before builds were reported never answers.
export const BUILD_REPLY_MS = 2500;

// A worker claims the page while it activates; the page messages it once it has.
export async function activated(worker: ServiceWorker, container: ServiceWorkerContainer) {
  if (worker.state === 'activating') await new Promise<void>(resolve => worker.addEventListener('statechange', () => resolve(), {once: true}));
  return worker.state === 'activated' && container.controller === worker;
}

// The build a worker installs, or null when it does not answer in time.
export function workerBuild(worker: ServiceWorker, timeout = BUILD_REPLY_MS) {
  return new Promise<unknown>(resolve => {
    const channel = new MessageChannel();
    const settle = (build: unknown) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(build);
    };
    const timer = setTimeout(() => settle(null), timeout);
    channel.port1.onmessage = event => settle(event.data);
    worker.postMessage({build: true}, [channel.port2]);
  });
}

// Offers a reload when a worker that took over the page runs another build than the page, once `ready` settles. A
// worker that stopped controlling the page meanwhile is no longer news: the one that replaced it decides.
export async function announceBuild(
  worker: ServiceWorker,
  container: ServiceWorkerContainer,
  page: string | undefined,
  ready: () => Promise<unknown>,
  offer: () => void,
  timeout = BUILD_REPLY_MS
) {
  if (!(await activated(worker, container)) || (await workerBuild(worker, timeout)) === page) return;
  await ready();
  if (container.controller === worker) offer();
}
