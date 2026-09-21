import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ApiError} from '../api/error';
import {capabilitiesBase, version} from '../api/mock/fixtures';
import {readSettings} from '../features/settings/settings';
import {translate} from '../i18n';
import {shellView} from './view';

const settings = readSettings({getItem: () => null, setItem: () => {}, removeItem: () => {}});
const t = translate.bind(null, 'en');
beforeEach(() => vi.stubEnv('VITE_ENGINE_ORG', 'https://github.com/daeuniverse'));
afterEach(() => vi.unstubAllEnvs());
it('uses the same capability policy for navigation, the page select, shortcuts and content', () => {
  const capabilities = structuredClone(capabilitiesBase);
  capabilities.resources.connections.available = false;
  const view = shellView(settings, 'connections', capabilities, null, version, null, t);
  expect(view.groups.flatMap(group => group.items).find(item => item.path === 'connections')).toMatchObject({current: true, unavailable: true});
  expect(view.choices.find(item => item.id === 'connections')?.desc).toBeDefined();
  expect(view.shortcutPaths.c).toBeUndefined();
  expect(view.content).toEqual({kind: 'unavailable'});
  expect(view.engine.text).toContain(version.engine.version);
  expect(view.about.apiText).toContain(version.api.name);
});
it('waits for discovery and yields protected pages to login without blocking settings', () => {
  expect(shellView(settings, 'connections', undefined, null, undefined, null, t).content.kind).toBe('loading');
  const error = new ApiError(401, 'authentication_required', 'token required');
  const configured = {...settings, profiles: [{id: 'router', name: 'Router', api: 'https://router.test', token: 'old'}], activeId: 'router'};
  expect(shellView(configured, 'connections', undefined, error, undefined, null, t).content).toEqual({kind: 'login', backend: 'Router', rejected: true});
  expect(shellView(configured, 'settings', undefined, error, undefined, null, t).content.kind).toBe('page');
});
