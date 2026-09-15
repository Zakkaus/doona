export type SseFrame = {id?: string; event: string; data: string};

/** Dispatch complete frames only; CRLF and UTF-8 may cross fetch chunks. */
export async function readSse(body: ReadableStream<Uint8Array>, onFrame: (frame: SseFrame) => void, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', event = '', id: string | undefined;
  let data: string[] = [];
  const line = (text: string) => {
    if (text === '') {
      onFrame({id, event: event || 'message', data: data.join('\n')});
      event = ''; id = undefined; data = [];
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const key = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (key === 'event') event = value;
    if (key === 'data') data.push(value);
    if (key === 'id' && !value.includes('\0')) id = value;
  };
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      const {value, done} = await reader.read();
      signal?.throwIfAborted();
      buffer += decoder.decode(value, {stream: !done});
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (c !== '\r' && c !== '\n') continue;
        if (c === '\r' && i === buffer.length - 1 && !done) break;
        line(buffer.slice(start, i));
        if (c === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (done) break;
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
