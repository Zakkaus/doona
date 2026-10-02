import {expect, it} from 'vitest';
import {normalizeCapabilities} from '../capabilities';
import type {EffectiveConfig, ReportedCapabilities} from '../model';
import {configManagement, configStore} from './honkConfig';

it.each([
  ['missing', {}, [false, false, false, false, false, undefined]],
  ['unknown extension', {'x-other': {config_export: {available: true}}}, [false, false, false, false, false, undefined]],
  [
    'false',
    {'x-honk': {config_export: {available: false}, config_revisions: {available: false, can_activate: true}}},
    [false, false, false, false, false, undefined]
  ],
  ['export only', {'x-honk': {config_export: {available: true}}}, [true, false, false, false, false, undefined]],
  ['read only', {'x-honk': {config_revisions: {available: true, max_revisions: 17}}}, [false, false, true, false, false, 17]],
  [
    'blocked writes',
    {config: {available: true, writable: false}, 'x-honk': {config_revisions: {available: true, can_activate: true}}},
    [false, false, true, false, true, undefined]
  ],
  ['import', {'x-honk': {config_import: {available: true, replace_required: true}}}, [false, true, false, true, false, undefined]],
  ['incomplete', {'x-honk': {config_import: {}, config_revisions: {can_activate: true}}}, [false, false, false, false, false, undefined]]
])('projects %s capabilities', (_name, resources, expected) => {
  const capabilities = normalizeCapabilities({resources} as unknown as ReportedCapabilities);
  expect(Object.values(configManagement(capabilities))).toEqual(expected);
});

it.each([true, false])('exposes only the neutral recording state (recorded=%s)', recorded => {
  const base: EffectiveConfig = {generation_id: 'generation', revision: 'opaque', sources: [], diagnostics: [], secrets_redacted: true};
  const config = {...base, 'x-honk': {store: {kind: 'db', revision: 12345, parent: 12344, recorded}}};
  expect(configStore(config)).toEqual({recorded});
  expect(configStore(base)).toBeUndefined();
  expect(configStore(undefined)).toBeUndefined();
});
