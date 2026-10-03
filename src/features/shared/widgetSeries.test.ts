import {expect, it} from 'vitest';
import {createMockApi} from '../../../mock';
import {cpuSample, foldCpu, latencySample, seriesFacts, sparkWindow, thin} from './widgetSeries';
import {translate, type Translator} from '../../i18n';

it('preserves unknown CPU readings and multicore percentages', async () => {
  const runtime = await createMockApi().runtime();
  runtime.process.cpu_percent = null;
  expect(cpuSample(runtime)?.value).toBeNull();
  runtime.process.cpu_percent = 145;
  expect(cpuSample(runtime)?.value).toBe(145);
  expect(
    foldCpu(
      [
        {time: 1, value: 145},
        {time: 2, value: null}
      ],
      3
    )
  ).toEqual({time: 3, value: 145});
  expect(foldCpu([{time: 1, value: null}], 2).value).toBeNull();
  runtime.observed_at = 'invalid';
  expect(cpuSample(runtime)).toBeUndefined();
});

it.each([
  ['a healthy node', 'healthy', 42, 42],
  ['a failed probe', 'unavailable', null, null],
  ['an unknown node', 'unknown', null, null],
  ['a missing observation', null, null, null],
  ['a node gone from the list', undefined, null, null]
] as const)('reads %s as a latency sample', async (_, state, latency, value) => {
  const {
    nodes: [node]
  } = await createMockApi().nodes();
  node.health = state ? node.health.map(row => ({...row, state, latency_ms: latency})) : [];
  expect(latencySample(state === undefined ? undefined : node, 5)).toEqual({time: 5, value});
});

// Values by position: a number is a reading, null a failed poll; one sample a second.
const samples = (values: Array<number | null>) => values.map((value, i) => ({time: i * 1000, value}));
it.each([
  ['keeps a short line as it is', [1, null, 3], [1, null, 3]],
  ['averages pairs of a long line', Array.from({length: 48}, (_, i) => i), Array.from({length: 24}, (_, i) => 2 * i + 0.5)],
  [
    'thins each run on its own and keeps one null between runs',
    [...Array.from({length: 20}, () => 10), null, null, ...Array.from({length: 20}, () => 30)],
    [...Array.from({length: 10}, () => 10), null, ...Array.from({length: 10}, () => 30)]
  ],
  ['keeps a trailing failure', [...Array.from({length: 26}, () => 5), null], [...Array.from({length: 13}, () => 5), null]]
])('%s', (_, values, expected) => {
  const thinned = thin(samples(values), foldCpu);
  expect(thinned.map(sample => sample.value)).toEqual(expected);
  const times = thinned.map(sample => sample.time);
  expect(times).toEqual([...times].sort((a, b) => a - b));
});

it('windows a ring into a sparkline with gaps kept', () => {
  const now = Date.now();
  const fine = [-200, -90, -60, -30].map((offset, i) => ({time: now + offset * 1000, value: i === 2 ? null : i}));
  const spark = sparkWindow({fine, coarse: []}, 120, foldCpu);
  expect(spark.values).toEqual([1, null, 3]);
  expect(spark.timestamps).toEqual(fine.slice(1).map(sample => sample.time));
});

it("lists each series' peak and average over its known samples", () => {
  const t: Translator = (key, params) => translate('en', key, params);
  const facts = seriesFacts(
    [
      {label: 'Download', values: [1, null, 5, 3]},
      {label: 'Upload', values: [null]}
    ],
    value => String(value),
    t
  );
  expect(facts).toEqual([
    {label: 'Download peak', value: '5'},
    {label: 'Download average', value: '3'},
    {label: 'Upload peak', value: '—'},
    {label: 'Upload average', value: '—'}
  ]);
});
