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
// A small ceiling keeps the cases short; one test below runs the production default.
const LIMIT = 64;
async function frames(chunks: (string | Uint8Array)[], limit = LIMIT) {
  const seen: {id?: string; event: string; data: string}[] = [];
  const {stream, state} = body(chunks);
  const outcome = await readSse(stream, frame => seen.push(frame), undefined, undefined, limit).then(
    () => null,
    (error: unknown) => error
  );
  return {seen, state, outcome};
}

const many = (count: number, make: (index: number) => string) => Array.from({length: count}, (_, index) => make(index));

describe('readSse', () => {
  const euro = encoder.encode('data: €\n\n');
  it.each([
    {name: 'LF frames', chunks: ['id: 1\nevent: log\ndata: a\n\n'], data: ['a']},
    {name: 'CRLF split between reads', chunks: ['data: a\r', '\n\r', '\n'], data: ['a']},
    {name: 'bare CR terminators', chunks: ['data: a\rdata: b\r\r'], data: ['a\nb']},
    {name: 'a multibyte character split between reads', chunks: [euro.slice(0, 7), euro.slice(7)], data: ['€']},
    {name: 'a line split over many reads', chunks: ['da', 'ta: ', 'abc', '\n', '\n'], data: ['abc']},
    {name: 'comments and an unfinished tail', chunks: [': beat\ndata: a\n\ndata: lost'], data: ['a']},
    {name: 'frames each under the ceiling', chunks: many(3, () => `data: ${'x'.repeat(LIMIT - 6)}\n\n`), data: many(3, () => 'x'.repeat(LIMIT - 6))},
    {name: 'comment lines that are not kept', chunks: [...many(8, () => `:${'o'.repeat(LIMIT - 1)}\n`), 'data: a\n\n'], data: ['a']}
  ])('dispatches $name', async ({chunks, data}) => {
    const {seen, outcome} = await frames(chunks);
    expect(outcome).toBeNull();
    expect(seen.map(frame => frame.data)).toEqual(data);
  });
  it.each([
    {name: 'an unterminated line', chunks: ['data: ', ...many(8, () => 'x'.repeat(16))]},
    {name: 'data lines without a blank line', chunks: many(8, index => `data: ${index}${'x'.repeat(16)}\n`)},
    {name: 'a complete frame over the ceiling', chunks: [`data: ${'x'.repeat(LIMIT)}\n\n`, 'data: b\n\n']},
    // 86 UTF-8 bytes in 46 code units: the ceiling counts UTF-8.
    {name: 'multibyte text over the ceiling', chunks: ['data: ', ...many(8, () => 'é'.repeat(10))]}
  ])('rejects $name and releases the body', async ({chunks}) => {
    const {seen, state, outcome} = await frames(chunks);
    expect(outcome).toMatchObject({code: 'frame_too_large', text: {key: 'ui.errStreamFrame', params: {size: `${LIMIT} B`}}});
    expect(seen).toEqual([]);
    expect(state.cancelled).toBe(true);
    // It stops reading at the ceiling instead of draining the rest.
    expect(state.pulled).toBeLessThan(chunks.length);
  });
  // Every single split point, plus seeded splits into three to six reads.
  function chunkings(bytes: Uint8Array) {
    let seed = 7;
    const random = () => ((seed = (seed * 48271) % 2147483647) % (bytes.length - 1)) + 1;
    const splits = Array.from({length: bytes.length - 1}, (_, index) => [index + 1]);
    for (let i = 0; i < 16; i++) splits.push([...new Set(Array.from({length: 2 + (i % 4)}, random))].sort((a, b) => a - b));
    return [[bytes], ...splits.map(cuts => [0, ...cuts].map((at, index) => bytes.slice(at, cuts[index] ?? bytes.length)))];
  }
  const near = (lines: string[]) => lines.join('\n') + '\n';
  it.each([
    {name: 'a complete comment over the ceiling', text: near([`:${'o'.repeat(LIMIT)}`, 'data: a', '']), data: [], error: true},
    {name: 'a comment at the ceiling', text: near([`:${'o'.repeat(LIMIT - 1)}`, 'data: a', '']), data: ['a'], error: false},
    {name: 'an id over the ceiling', text: near([`id: ${'x'.repeat(LIMIT + 16)}`, 'data: {}', '']), data: [], error: true},
    {name: 'an event over the ceiling', text: near([`event: ${'x'.repeat(LIMIT)}`, 'data: {}', '']), data: [], error: true},
    {name: 'event and data at the ceiling', text: near(['event: e', `data: ${'x'.repeat(LIMIT - 14)}`, '']), data: ['x'.repeat(LIMIT - 14)], error: false},
    {name: 'event and data a byte over', text: near(['event: e', `data: ${'x'.repeat(LIMIT - 13)}`, '']), data: [], error: true},
    {name: 'id and data over together', text: near([`id: ${'x'.repeat(LIMIT / 2)}`, `data: ${'x'.repeat(LIMIT / 2)}`, '']), data: [], error: true},
    {
      name: 'multibyte data at the ceiling',
      text: `data: ${'é'.repeat((LIMIT - 6) / 2)}\r\n\r\ndata: b\r\n\r\n`,
      data: ['é'.repeat((LIMIT - 6) / 2), 'b'],
      error: false
    }
  ])('gives $name the same outcome however the reads split it', async ({text, data, error}) => {
    for (const chunks of chunkings(encoder.encode(text))) {
      const {seen, outcome} = await frames(chunks);
      expect(seen.map(frame => frame.data)).toEqual(data);
      expect(outcome === null ? null : (outcome as {code: string}).code).toBe(error ? 'frame_too_large' : null);
    }
  });
  it('defaults to a 1 MiB ceiling', async () => {
    const under = `data: ${'x'.repeat(MAX_FRAME_BYTES - 6)}\n\n`;
    const over = `data: ${'x'.repeat(MAX_FRAME_BYTES - 5)}\n\n`;
    const lengths: number[] = [];
    // Called without a limit, as the client calls it.
    const outcome = await readSse(body([under, over]).stream, frame => lengths.push(frame.data.length)).catch((error: unknown) => error);
    expect(lengths).toEqual([MAX_FRAME_BYTES - 6]);
    expect(outcome).toMatchObject({code: 'frame_too_large', text: {params: {size: '1 MiB'}}});
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
