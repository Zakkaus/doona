export function wait(seconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      },
      Math.max(1, seconds) * 1000
    );
    signal?.addEventListener('abort', abort, {once: true});
  });
}
