import {expect, it} from 'vitest';
import {readTag, tagId} from './taggedId';

it('reads back the kind and the whole value, colons included', () => {
  const kinds = ['src', 'rule'] as const;
  expect(readTag(tagId('rule', 'domain(a.test) -> proxy'), kinds)).toEqual({kind: 'rule', value: 'domain(a.test) -> proxy'});
  expect(readTag(tagId('src', '::1'), kinds)).toEqual({kind: 'src', value: '::1'});
  expect(readTag(tagId('src', ''), kinds)).toEqual({kind: 'src', value: ''});
  expect(readTag('outbound:proxy', kinds)).toBeNull();
  expect(readTag(':src', kinds)).toBeNull();
  expect(readTag('src', kinds)).toBeNull();
});
