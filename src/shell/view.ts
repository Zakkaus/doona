import type {ComponentType, SVGProps} from 'react';
import type {Capabilities, Version} from '../api/model';
import {ApiError} from '../api/error';
import {isDemoApi} from '../api/profiles';
import type {Scheme, Settings} from './preferences';
import {palettes, type PaletteId} from './palettes';
import {defaultRoute, hubs, type PageProps} from './routes';
import {LANGS, type Translator} from '../i18n';
import {features, navAvailable} from './registry';
import {href} from './route';

export type ShortcutView = {id: string; path: string; key: string; sequence: string; label: string};
export type AboutView = {
  title: string;
  close: string;
  duck: string;
  quack: string;
  tagline: string;
  credits: string;
  privacy: string;
  versionText: string;
  items: Array<[string, string]>;
  repositories: Array<{href: string; label: string}>;
};
type NavItem = {
  id: string;
  path: string;
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  current: boolean;
  unavailable: boolean;
  description: string | undefined;
};
export type NavGroup = {id: string; label: string; items: NavItem[]};
export type BackendTone = 'ok' | 'warn' | 'err' | 'neutral';
export type BackendView = {
  // The engine's name and version, as the indicator shows them.
  text: string;
  tone: BackendTone;
  state: string;
  // The indicator's accessible name: what it is, and the state.
  label: string;
  title: string;
  facts: Array<[string, string]>;
  about: string;
  project: {href: string; label: string};
};
export type PaletteSection = {title: string; items: Array<{id: string; label: string; desc?: string; className?: string}>};
export type AppearanceMenu = ReturnType<typeof appearanceMenu>;
export type ShellView = {
  groups: NavGroup[];
  current: {id: string; path: string; title: string; hint: string | undefined; Page: ComponentType<PageProps>};
  content: {kind: 'login'; profileId: string; api: string; backend: string; rejected: boolean} | {kind: 'loading' | 'unavailable' | 'page'};
  busy: boolean;
  error: Error | null;
  backend: BackendView;
  about: AboutView;
  shortcuts: ShortcutView[];
  shortcutPaths: Record<string, string>;
};
// A 401 on any read means the credential no longer works, whatever discovery last reported; sign-in comes first.
export const accessError = (discovery: Error | null, refusal: Error | null) => refusal ?? discovery;

export function shellView(
  settings: Settings,
  route: string,
  capabilities: Capabilities | undefined,
  capabilityError: Error | null,
  version: Version | undefined,
  versionError: Error | null,
  t: Translator
): ShellView {
  const profile = settings.profiles.find(item => item.id === settings.activeId);
  const feature = features.find(item => item.path === route) ?? features.find(item => item.path === defaultRoute)!;
  const offered = (path: string) => navAvailable(path, capabilities);
  const groups = hubs.map(hub => ({
    id: hub.id,
    label: t(hub.titleKey),
    items: hub.pages.flatMap(path => {
      const item = features.find(feature => feature.path === path);
      return item?.nav
        ? [
            {
              id: item.id,
              path: item.path,
              href: href(item.path),
              label: t(item.nav.titleKey),
              Icon: item.nav.Icon,
              current: item.path === route,
              unavailable: !offered(item.path),
              description: offered(item.path) ? undefined : t('shell.notOffered')
            }
          ]
        : [];
    })
  }));
  const refused = (error: Error | null) => error instanceof ApiError && (error.status === 401 || error.status === 403);
  const needsLogin = refused(capabilityError) || (capabilityError instanceof ApiError && capabilityError.status === 404);
  const content: ShellView['content'] =
    needsLogin && !feature.offline
      ? {kind: 'login', profileId: profile?.id ?? '', api: profile?.api ?? '', backend: profile?.name ?? profile?.api ?? '', rejected: !!profile?.token}
      : !capabilities && !capabilityError && !feature.offline
        ? {kind: 'loading'}
        : capabilities && !offered(feature.path)
          ? {kind: 'unavailable'}
          : {kind: 'page'};
  const org = import.meta.env.VITE_ENGINE_ORG;
  const engineText = version ? `${version.engine.name} ${version.engine.version}` : '—';
  const build = version?.build?.revision ? ` (${version.build.revision.slice(0, 12)})` : '';
  const apiText = version ? t('ui.apiVersion', {name: version.api.name, major: version.api.major, status: version.api.status}) : '—';
  const contractText = import.meta.env.VITE_DOONA_CONTRACT_COMMIT;
  const engineName = version?.engine.name ?? org.split('/').pop()!;
  const api = profile?.api;
  const address = isDemoApi(api) ? t('shell.backend.demo') : api;
  const [tone, stateKey] = backendState(needsLogin, !capabilities && !capabilityError, capabilityError, versionError);
  const shortcuts = features.flatMap(item =>
    item.shortcut && item.nav && offered(item.path)
      ? [{id: item.id, path: item.path, key: item.shortcut, sequence: `g ${item.shortcut}`, label: t(item.nav.titleKey)}]
      : []
  );
  return {
    groups,
    current: {
      id: feature.id,
      path: route,
      title: t(feature.nav?.titleKey ?? 'nav.activity'),
      hint: feature.nav?.hintKey ? t(feature.nav.hintKey) : undefined,
      Page: feature.Page
    },
    content,
    busy: !capabilities && !capabilityError,
    // The login surface explains refused credentials and missing API routes itself.
    error:
      content.kind === 'login'
        ? refused(versionError) || (versionError instanceof ApiError && versionError.status === 404)
          ? null
          : versionError
        : (capabilityError ?? versionError),
    backend: {
      text: engineText,
      tone,
      state: t(stateKey),
      label: t('shell.backend.label', {engine: engineText, state: t(stateKey)}),
      title: t('shell.backend.title'),
      facts: [
        [t('about.engine'), engineText + build],
        [t('about.api'), apiText],
        // The built-in demo data runs without a profile.
        ...(profile ? [[t('shell.backend.profile'), profile.name] as [string, string]] : []),
        [t('shell.backend.address'), address],
        [t('shell.backend.state'), t(stateKey)]
      ],
      about: t('about.title'),
      project: {href: version ? `${org}/${version.engine.name}` : org, label: t('shell.backend.project', {engine: engineName})}
    },
    shortcuts,
    shortcutPaths: Object.fromEntries(shortcuts.map(item => [item.key, item.path])),
    about: {
      title: t('about.title'),
      close: t('about.close'),
      duck: t('about.duck'),
      quack: t('about.quack'),
      tagline: t('about.tagline', {engine: org.split('/').pop()!}),
      credits: t('about.credits'),
      privacy: t('about.privacy'),
      versionText: `v${import.meta.env.VITE_DOONA_VERSION}`,
      items: [
        [t('about.engine'), engineText + build],
        [t('about.api'), apiText],
        [t('about.contract'), contractText],
        [t('about.license'), 'GPL-3.0-only']
      ],
      repositories: [
        {href: import.meta.env.VITE_DOONA_REPO, label: 'doona'},
        {href: org, label: org.split('/').pop()!}
      ]
    }
  };
}
// The connection as the shell already knows it from discovery and the version read; no read of its own. A refused
// credential needs a sign-in, a failed discovery means the backend cannot be reached, and a backend that answers
// discovery but not the version read works with less than the shell expects.
export function backendState(
  needsLogin: boolean,
  connecting: boolean,
  capabilityError: Error | null,
  versionError: Error | null
): [BackendTone, 'shell.backend.signIn' | 'shell.backend.connecting' | 'shell.backend.offline' | 'shell.backend.degraded' | 'shell.backend.connected'] {
  if (needsLogin) return ['warn', 'shell.backend.signIn'];
  if (connecting) return ['neutral', 'shell.backend.connecting'];
  if (capabilityError) return ['err', 'shell.backend.offline'];
  if (versionError) return ['warn', 'shell.backend.degraded'];
  return ['ok', 'shell.backend.connected'];
}
export function wordmark(honked: boolean) {
  return honked ? 'doooooona' : 'doona';
}
export function duckView(taps: number) {
  const honked = taps >= 5;
  const painted = honked && (taps - 5) % 2 === 1;
  return {honked, painted, hop: taps > 0 && !painted, wordmark: wordmark(honked)};
}
// The appearance menu: one section per run of palettes that share a group.
export function paletteMenu(t: Translator): Array<{title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}> {
  const sections: Array<{group: string; title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}> = [];
  for (const palette of palettes) {
    const item = {id: palette.id, label: t(palette.label), desc: t(palette.desc)};
    const last = sections.at(-1);
    if (last?.group === palette.group) last.items.push(item);
    else sections.push({group: palette.group, title: t(palette.group), items: [item]});
  }
  return sections.map(({title, items}) => ({title, items}));
}

export const languageItems = LANGS.map(([id, label]) => ({id, label}));
export function appearanceMenu(t: Translator, scheme: Scheme, dark: boolean) {
  return {
    wordmarks: [
      {id: 'gradient', label: t('wordmark.gradient')},
      {id: 'plain', label: t('wordmark.plain')}
    ],
    schemes: [
      {id: 'system', label: t('theme.system')},
      {id: 'light', label: t('theme.light')},
      {id: 'dark', label: t('theme.dark')}
    ],
    themeLabel: t('shell.theme', {theme: t(scheme === 'system' ? 'theme.system' : dark ? 'theme.dark' : 'theme.light')})
  };
}
