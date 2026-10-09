import {ipLiteral} from '../../api/selectors';

export function isPublicIp(ip: string): boolean {
  let value = ipLiteral(ip);
  if (!value) return false;
  const mapped = value.match(/^::ffff:([\da-f]+):([\da-f]+)$/);
  if (mapped) {
    const bits = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
    value = [bits >>> 24, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.');
  }
  if (value.includes(':')) {
    const first = parseInt(value.split(':')[0] || '0', 16);
    return value !== '::' && value !== '::1' && (first & 0xfe00) !== 0xfc00 && (first & 0xffc0) !== 0xfe80 && (first & 0xff00) !== 0xff00;
  }
  const [a, b] = value.split('.').map(Number);
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a < 224 &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && b === 168)
  );
}
export function ipLookupSites(address: string) {
  const ip = ipLiteral(address);
  return [
    {name: 'ipinfo.io', href: `https://ipinfo.io/${ip}`},
    {name: 'ipapi.is', href: `https://ipapi.is/?q=${ip}`},
    {name: 'ip-api.com', href: `https://ip-api.com/#${ip}`},
    {name: 'bgp.he.net', href: `https://bgp.he.net/ip/${ip}`}
  ];
}
