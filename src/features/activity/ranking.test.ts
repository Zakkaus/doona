import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {connectionRanking} from './ranking';

it('groups both transports by source IP or domain, falling back to the destination', async () => {
  const snapshot = await createMockApi().connections();
  const row = snapshot.tcp[0];
  snapshot.tcp = [
    {...row, src: '[2001:db8::1]:80', domain: 'a.example', download_bytes: '100'},
    {...row, src: '10.0.0.1:80', domain: '', dst: '192.0.2.1:443', download_bytes: '50'}
  ];
  snapshot.udp = [{...row, src: '[2001:db8::1]:53', domain: 'a.example', download_bytes: '50'}];
  expect(connectionRanking(snapshot, 'dev')).toEqual([
    {name: '2001:db8::1', download: 150n, percent: 75},
    {name: '10.0.0.1', download: 50n, percent: 25}
  ]);
  expect(connectionRanking(snapshot, 'host')).toEqual([
    {name: 'a.example', download: 150n, percent: 75},
    {name: '192.0.2.1:443', download: 50n, percent: 25}
  ]);
});

it('uses all groups for percentages before taking the top five and keeps exact large counters', async () => {
  const snapshot = await createMockApi().connections();
  const row = snapshot.tcp[0];
  snapshot.tcp = Array.from({length: 6}, (_, i) => ({...row, domain: String(i), download_bytes: '18446744073709551615'}));
  snapshot.udp = [{...row, domain: '', dst: '', download_bytes: null}];
  expect(connectionRanking(snapshot, 'host')).toEqual(Array.from({length: 5}, (_, i) => ({name: String(i), download: 18446744073709551615n, percent: 16.67})));
});

it('sorts unknown aggregates last and leaves every share unknown when any group is unknown', async () => {
  const snapshot = await createMockApi().connections();
  const row = snapshot.tcp[0];
  snapshot.tcp = [
    {...row, domain: 'unknown', download_bytes: '100'},
    {...row, domain: 'known', download_bytes: '20'}
  ];
  snapshot.udp = [{...row, domain: 'unknown', download_bytes: null}];
  expect(connectionRanking(snapshot, 'host')).toEqual([
    {name: 'known', download: 20n, percent: null},
    {name: 'unknown', download: null, percent: null}
  ]);
  snapshot.tcp = [{...row, domain: 'zero', download_bytes: '0'}];
  snapshot.udp = [];
  expect(connectionRanking(snapshot, 'host')).toEqual([{name: 'zero', download: 0n, percent: 0}]);
  expect(connectionRanking(undefined, 'dev')).toEqual([]);
});
