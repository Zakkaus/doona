import {expect, it} from 'vitest';
import {ipLookupSites, isPublicIp} from './ipLookup';

it.each([
  ['0.0.0.0', false],
  ['0.255.255.255', false],
  ['1.0.0.0', true],
  ['9.255.255.255', true],
  ['10.0.0.0', false],
  ['10.255.255.255', false],
  ['11.0.0.0', true],
  ['100.63.255.255', true],
  ['100.64.0.0', false],
  ['100.127.255.255', false],
  ['100.128.0.0', true],
  ['126.255.255.255', true],
  ['127.0.0.0', false],
  ['127.255.255.255', false],
  ['128.0.0.0', true],
  ['169.253.255.255', true],
  ['169.254.0.0', false],
  ['169.254.255.255', false],
  ['169.255.0.0', true],
  ['172.15.255.255', true],
  ['172.16.0.0', false],
  ['172.31.255.255', false],
  ['172.32.0.0', true],
  ['192.167.255.255', true],
  ['192.168.0.0', false],
  ['192.168.255.255', false],
  ['192.169.0.0', true],
  ['223.255.255.255', true],
  ['224.0.0.0', false],
  ['239.255.255.255', false],
  ['240.0.0.0', false],
  ['255.255.255.255', false],
  ['::', false],
  ['::1', false],
  ['::2', true],
  ['fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true],
  ['fc00::', false],
  ['fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false],
  ['fe00::', true],
  ['fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true],
  ['fe80::', false],
  ['febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false],
  ['fec0::', true],
  ['feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true],
  ['ff00::', false],
  ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false],
  ['192.0.2.1', true],
  ['198.51.100.1', true],
  ['203.0.113.1', true],
  ['2001:db8::1', true],
  ['::ffff:8.8.8.8', true],
  ['::ffff:10.0.0.1', false],
  ['::ffff:192.168.0.1', false],
  ['::ffff:7f00:1', false],
  ['::ffff:e000:1', false],
  ['::ffff:0:0', false],
  ['', false],
  ['example.com', false],
  ['256.1.1.1', false],
  ['01.2.3.4', false],
  ['1.2.3', false],
  ['8.8.8.8:53', false],
  ['2001:::1', false],
  ['gggg::1', false],
  ['fe80::1%eth0', false]
])('classifies public IP %s as %s', (ip, expected) => {
  expect(isPublicIp(ip as string)).toBe(expected);
});

it.each([
  ['ipinfo.io', 'https://ipinfo.io/'],
  ['ipapi.is', 'https://ipapi.is/?q='],
  ['ip-api.com', 'https://ip-api.com/#'],
  ['bgp.he.net', 'https://bgp.he.net/ip/']
])('builds normalized IPv4 and IPv6 lookup URLs for %s', (name, prefix) => {
  for (const [address, ip] of [
    [' 192.0.2.1 ', '192.0.2.1'],
    ['[2001:0DB8:0:0::1]', '2001:db8::1']
  ]) {
    const sites = ipLookupSites(address);
    expect(sites.map(site => site.name)).toEqual(['ipinfo.io', 'ipapi.is', 'ip-api.com', 'bgp.he.net']);
    expect(sites.find(site => site.name === name)?.href).toBe(prefix + ip);
  }
});
