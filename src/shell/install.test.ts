import {describe, expect, it} from 'vitest';
import {installHint} from './install';

const ua = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  mac26: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  mac18: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  edgeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/140.0.3485.94 Mobile/15E148 Safari/605.1.15',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
};
const browser = () => false;

describe('installHint', () => {
  it.each([
    ['iPhone Safari', {userAgent: ua.iphone, maxTouchPoints: 5, standalone: false}, 'ios'],
    ['iPadOS Safari with a Mac user agent', {userAgent: ua.mac26, maxTouchPoints: 5, standalone: false}, 'ios'],
    ['iPadOS Safari on an older release', {userAgent: ua.mac18, maxTouchPoints: 5, standalone: false}, 'ios'],
    ['macOS Safari 26', {userAgent: ua.mac26, maxTouchPoints: 0}, 'mac'],
    ['macOS Safari 26 that defines navigator.standalone', {userAgent: ua.mac26, maxTouchPoints: 0, standalone: false}, 'mac'],
    ['macOS Safari 18, which may run on a macOS without Add to Dock', {userAgent: ua.mac18, maxTouchPoints: 0}, null],
    ['Chrome on iOS', {userAgent: ua.chromeIos, maxTouchPoints: 5, standalone: false}, null],
    ['Firefox on iOS', {userAgent: ua.firefoxIos, maxTouchPoints: 5, standalone: false}, null],
    ['Edge on iOS', {userAgent: ua.edgeIos, maxTouchPoints: 5, standalone: false}, null],
    ['Chrome on macOS', {userAgent: ua.chromeMac, maxTouchPoints: 0}, null],
    ['Firefox on macOS', {userAgent: ua.firefoxMac, maxTouchPoints: 0}, null],
    ['Firefox on Linux', {userAgent: ua.firefoxLinux, maxTouchPoints: 0}, null],
    ['Firefox on Android', {userAgent: ua.firefoxAndroid, maxTouchPoints: 5}, null],
    ['Chrome on Android', {userAgent: ua.chromeAndroid, maxTouchPoints: 5}, null],
    ['an unknown browser', {userAgent: '', maxTouchPoints: 0}, null]
  ] as const)('%s', (_name, nav, expected) => {
    expect(installHint(nav, browser)).toBe(expected);
  });

  it('shows nothing once the page runs from the iOS Home Screen', () => {
    expect(installHint({userAgent: ua.iphone, maxTouchPoints: 5, standalone: true}, browser)).toBeNull();
  });

  it.each(['(display-mode: standalone)', '(display-mode: minimal-ui)'])('shows nothing when %s matches', mode => {
    const matches = (query: string) => query.split(', ').includes(mode);
    expect(installHint({userAgent: ua.mac26, maxTouchPoints: 0}, matches)).toBeNull();
    expect(installHint({userAgent: ua.iphone, maxTouchPoints: 5, standalone: false}, matches)).toBeNull();
  });
});
