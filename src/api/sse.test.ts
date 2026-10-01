import {describe, expect, it, vi} from 'vitest';
import {MAX_FRAME_BYTES, readSse} from './sse';

const encoder = new TextEncoder();
// A body whose reads are the given chunks; `cancelled` reports whether the parser released it.
function body(chunks: (string | Uint8Array)[]) {
  const state = {cancelled: false, pulled: 0};
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[state.pulled++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
    },
    cancel() {
      state.cancelled = true;
    }
  });
  return {stream, state};
}
async function frames(chunks: (string | Uint8Array)[]) {
  const seen: {id?: string; event: string; data: string}[] = [];
  const {stream, state} = body(chunks);
  const outcome = await readSse(stream, frame => seen.push(frame)).then(
    () => null,
    (error: unknown) => error
  );
  return {seen, state, outcome};
}

describe('readSse', () => {
  const euro = encoder.encode('data: €\n\n');
  it.each([
    {name: 'LF frames', chunks: ['id: 1\nevent: log\ndata: a\n\n'], data: ['a']},
    {name: 'CRLF split between reads', chunks: ['data: a\r', '\n\r', '\n'], data: ['a']},
    {name: 'bare CR terminators', chunks: ['data: a\rdata: b\r\r'], data: ['a\nb']},
    {name: 'a multibyte character split between reads', chunks: [euro.slice(0, 7), euro.slice(7)], data: ['€']},
    {name: 'a line split over many reads', chunks: ['da', 'ta: ', 'abc', '\n', '\n'], data: ['abc']},
    {name: 'a frame just under the ceiling', chunks: [`data: ${'x'.repeat(MAX_FRAME_BYTES - 7)}\n\n`], data: ['x'.repeat(MAX_FRAME_BYTES - 7)]},
    {name: 'comments and an unfinished tail', chunks: [': beat\ndata: a\n\ndata: lost'], data: ['a']}
  ])('dispatches $name', async ({chunks, data}) => {
    const {seen, outcome} = await frames(chunks);
    expect(outcome).toBeNull();
    expect(seen.map(frame => frame.data)).toEqual(data);
  });
  const chunk = 'x'.repeat(64 * 1024);
  const many = (count: number, make: (index: number) => string) => Array.from({length: count}, (_, index) => make(index));
  it.each([
    {name: 'an unterminated line', chunks: ['data: ', ...many(32, () => chunk)]},
    {name: 'data lines without a blank line', chunks: many(32, index => `data: ${index}${chunk}\n`)},
    {name: 'a complete frame over the ceiling', chunks: [`data: ${'x'.repeat(MAX_FRAME_BYTES)}\n\n`, 'data: b\n\n']},
    // Two bytes per character: the ceiling counts UTF-8, not UTF-16 code units.
    {name: 'multibyte text over the ceiling', chunks: ['data: ', ...many(10, () => 'é'.repeat(64 * 1024))]}
  ])('rejects $name and releases the body', async ({chunks}) => {
    const {seen, state, outcome} = await frames(chunks);
    expect(outcome).toMatchObject({code: 'frame_too_large', text: {key: 'ui.errStreamFrame', params: {size: '1 MiB'}}});
    expect(seen).toEqual([]);
    expect(state.cancelled).toBe(true);
    // It stops reading at the ceiling instead of draining the rest.
    expect(state.pulled).toBeLessThan(chunks.length);
  });
  it('counts each frame from zero', async () => {
    const half = `data: ${'x'.repeat(MAX_FRAME_BYTES / 2)}\n\n`;
    const {seen, outcome} = await frames([half, half, half]);
    expect(outcome).toBeNull();
    expect(seen).toHaveLength(3);
  });
  it('ignores comment lines in the ceiling', async () => {
    const {seen, outcome} = await frames([...many(32, () => `:${chunk}\n`), 'data: a\n\n']);
    expect(outcome).toBeNull();
    expect(seen.map(frame => frame.data)).toEqual(['a']);
  });
  it('cancels the body and removes its listener when aborted', async () => {
    const controller = new AbortController();
    const {stream, state} = body(['data: a\n\n']);
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const outcome = readSse(stream, () => controller.abort(), controller.signal);
    await expect(outcome).rejects.toBeDefined();
    expect(state.cancelled).toBe(true);
    expect(removed.mock.calls.map(call => call[0])).toEqual(['abort']);
  });
});
