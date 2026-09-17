import {expect, it} from 'vitest';
import {iconForName, iconSource} from './brand';

it('resolves named icons from the local mapping, then the configuration', () => {
  const overrides = [{name: 'gaming', icon: 'https://icons.example/g.png'}];
  expect(iconForName('gaming', 'https://icons.example/config.png', overrides)).toBe('https://icons.example/g.png');
  expect(iconForName('proxy', 'https://icons.example/p.png', overrides)).toBe('https://icons.example/p.png');
  expect(iconForName('proxy', null, overrides)).toBeNull();
});

it('loads only http(s) URLs and inline images', () => {
  expect(iconSource('https://icons.example/p.png')).toBe('https://icons.example/p.png');
  expect(iconSource('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  expect(iconSource('javascript:alert(1)')).toBeNull();
  expect(iconSource('netflix')).toBeNull();
});
