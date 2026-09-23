import {expect, it} from 'vitest';
import {trafficSeries} from './scatter';

const row = (id: string, outbound: string, up: string | null, down: string | null, domain: string | null = null) => ({
  id,
  outbound,
  upload_bytes: up,
  download_bytes: down,
  domain,
  dst: '10.0.0.1:443'
});

it('places connections by outbound, keeps zeros and counts those without totals', () => {
  const view = trafficSeries([
    row('a', 'proxy', '0', '0'),
    row('b', 'direct', '10', '2000', 'x.org'),
    row('c', 'proxy', null, '5'),
    row('d', 'block', '1', '1')
  ]);
  expect(view.series.map(s => s.outbound)).toEqual(['block', 'direct', 'proxy']);
  expect(view.series[2].points).toEqual([{id: 'a', up: 0, down: 0, name: '10.0.0.1:443'}]);
  expect(view.unknown).toBe(1);
  expect(view.placed).toBe(3);
  expect(view.heaviest).toMatchObject({id: 'b', name: 'x.org', outbound: 'direct'});
});

it('has no heaviest connection when nothing can be placed', () => {
  expect(trafficSeries([row('a', 'proxy', null, null)]).heaviest).toBeUndefined();
});

it('picks the heaviest connection exactly beyond the safe integer range', () => {
  const view = trafficSeries([row('a', 'proxy', '9007199254740992', '0'), row('b', 'proxy', '9007199254740993', '0')]);
  expect(view.heaviest?.id).toBe('b');
});
