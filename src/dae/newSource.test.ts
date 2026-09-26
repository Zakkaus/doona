import {expect, it} from 'vitest';
import type {ConfigSource} from '../api/model';
import {globMatch, includeDirectory, includePatterns, includedBy, namePatterns, newSourceNameProblem, newSourcePathProblem, sourceAt} from './newSource';

it('reads include patterns from top-level include sections, without comments or quotes', () => {
  const text = `global { log_level: info }
include {
  # extra files
  config.d/*.dae
  'extra.dae'
}
routing {
  include rules.dae
}
`;
  expect(includePatterns(text)).toEqual(['config.d/*.dae', 'extra.dae']);
  expect(includePatterns('include { *.dae }')).toEqual(['*.dae']);
  expect(includePatterns('routing { fallback: direct }')).toEqual([]);
});

it('matches globs within one path segment and everything else literally', () => {
  expect(globMatch('config.d/*.dae', 'config.d/work.dae')).toBe(true);
  expect(globMatch('./config.d/*.dae', 'config.d/work.dae')).toBe(true);
  expect(globMatch('config.d/*.dae', 'config.d/sub/work.dae')).toBe(false);
  expect(globMatch('config.d/*.dae', 'configxd/work.dae')).toBe(false);
  expect(globMatch('rule?.dae', 'rule1.dae')).toBe(true);
  expect(globMatch('extra.dae', 'extra.dae')).toBe(true);
  expect(includedBy(['extra.dae', 'config.d/*.dae'], 'other.dae')).toBe(false);
});

it('offers the directory of the first pattern that globs names in a fixed directory', () => {
  expect(includeDirectory(['extra.dae', 'config.d/*.dae', 'more/*.dae'])).toBe('config.d/');
  expect(includeDirectory(['./a/b/*.dae'])).toBe('a/b/');
  expect(includeDirectory(['*.dae', '*/x.dae', 'extra.dae'])).toBe('');
});

it('accepts only relative .dae paths with normal segments and no control characters', () => {
  expect(newSourcePathProblem('config.d/work.dae')).toBeNull();
  expect(newSourcePathProblem('work.dae')).toBeNull();
  expect(newSourcePathProblem('/etc/honk/work.dae')).toBe('config.newSourceAbsolute');
  expect(newSourcePathProblem('../work.dae')).toBe('config.newSourceSegments');
  expect(newSourcePathProblem('config.d/./work.dae')).toBe('config.newSourceSegments');
  expect(newSourcePathProblem('config.d//work.dae')).toBe('config.newSourceSegments');
  expect(newSourcePathProblem('config.d/')).toBe('config.newSourceSegments');
  expect(newSourcePathProblem('config.d/work.conf')).toBe('config.newSourceExtension');
  expect(newSourcePathProblem('config.d/.dae')).toBe('config.newSourceExtension');
  expect(newSourcePathProblem('work\t.dae')).toBe('config.newSourceControl');
});

it('finds a created source by a relative or an absolute reported path', () => {
  const source = (id: string, path: string, kind: ConfigSource['kind'] = 'include') => ({id, path, kind}) as ConfigSource;
  expect(sourceAt([source('m', 'config.dae', 'main'), source('n', 'config.d/a.dae')], 'config.d/a.dae')?.id).toBe('n');
  expect(sourceAt([source('m', '/etc/honk/config.dae', 'main'), source('n', '/etc/honk/config.d/a.dae')], 'config.d/a.dae')?.id).toBe('n');
  expect(sourceAt([source('m', '/etc/honk/config.dae', 'main')], 'config.d/a.dae')).toBeNull();
});

it('fills only patterns with one `*` in a fixed directory and a .dae tail, fixing the text around it', () => {
  expect(namePatterns(['config.d/*.dae', './rules/r-*.rule.dae', 'config.d/*.dae'])).toEqual([
    {pattern: 'config.d/*.dae', prefix: 'config.d/', suffix: '.dae'},
    {pattern: 'rules/r-*.rule.dae', prefix: 'rules/r-', suffix: '.rule.dae'}
  ]);
  expect(namePatterns(['*.dae', 'extra.dae', 'config.d/**.dae', '*/x.dae', 'a/*-*.dae', 'a/?*.dae', 'config.d/*', '../up/*.dae'])).toEqual([]);
});

it('checks a name through the path rules of the path it fills', () => {
  const pattern = {pattern: 'config.d/*.dae', prefix: 'config.d/', suffix: '.dae'};
  expect(newSourceNameProblem('work', pattern)).toBeNull();
  expect(newSourceNameProblem('a/b', pattern)).toBe('config.newSourceNameSlash');
  expect(newSourceNameProblem('bad\u0007name', pattern)).toBe('config.newSourceNameControl');
});
