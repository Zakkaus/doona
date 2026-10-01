import {clientError} from './error';

type SseFrame = {id?: string; event: string; data: string};

// The contract advertises no frame ceiling. Events carry references and logs one sanitised record, so a frame this
// large is a broken stream; holding it unbounded would grow the page's memory with the input until the tab crashes.
export const MAX_FRAME_BYTES = 1 << 20;

// UTF-8 bytes of one UTF-16 code unit; a surrogate pair is four bytes, counted on its high half.
const utf8 = (code: number) => (code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xdc00 && code < 0xe000 ? 0 : code >= 0xd800 && code < 0xdc00 ? 4 : 3);

/**
 * Dispatch complete frames only; CRLF and UTF-8 may cross fetch chunks. `onChunk` sees every read, comments included.
 * Each read is scanned once. Every line, finished or not and whatever its field, counts against `limit`
 * together with the data, id and event its frame already holds, so how the bytes are split into reads never changes the
 * outcome. Past the ceiling the stream ends with a terminal `frame_too_large` error rather than a truncated frame.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
  signal?: AbortSignal,
  onChunk?: () => void,
  limit = MAX_FRAME_BYTES
): Promise<void> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  // The unfinished line as the reads that carried it, joined once it ends.
  let partial: string[] = [];
  // UTF-8 bytes of the current line, and of the lines the current frame holds by field.
  let lineBytes = 0,
    dataBytes = 0,
    idBytes = 0,
    eventBytes = 0,
    skipLf = false,
    event = '',
    id: string | undefined;
  let data: string[] = [];
  const tooLarge = () =>
    clientError(0, 'frame_too_large', `Event stream frame exceeds ${limit} bytes`, 'ui.errStreamFrame', {
      size: limit % 1048576 ? `${limit} B` : `${limit / 1048576} MiB`
    });
  const over = () => dataBytes + idBytes + eventBytes + lineBytes > limit;
  const line = (text: string) => {
    if (over()) throw tooLarge();
    if (text === '') {
      onFrame({id, event: event || 'message', data: data.join('\n')});
      event = '';
      id = undefined;
      data = [];
      dataBytes = idBytes = eventBytes = 0;
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const key = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (key === 'event') {
      event = value;
      eventBytes = lineBytes;
    }
    if (key === 'data') {
      data.push(value);
      dataBytes += lineBytes;
    }
    if (key === 'id' && !value.includes('\0')) {
      id = value;
      idBytes = lineBytes;
    }
  };
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      const {value, done} = await reader.read();
      signal?.throwIfAborted();
      onChunk?.();
      const text = decoder.decode(value, {stream: !done});
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code !== 13 && code !== 10) {
          skipLf = false;
          lineBytes += utf8(code);
          continue;
        }
        // The LF of a CRLF whose CR ended the previous line, possibly in the previous read.
        if (code === 10 && skipLf) {
          skipLf = false;
          start = i + 1;
          continue;
        }
        skipLf = code === 13;
        const head = text.slice(start, i);
        line(partial.length ? partial.join('') + head : head);
        partial = [];
        lineBytes = 0;
        start = i + 1;
      }
      if (start < text.length) {
        if (over()) throw tooLarge();
        partial.push(text.slice(start));
      }
      if (done) break;
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
