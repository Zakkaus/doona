import type {ComponentType, SVGProps} from 'react';
import type {Capabilities, Version} from '../api/model';
import {ApiError} from '../api/error';
import type {PaletteId, Scheme, Settings} from '../features/settings/settings';
import type {PageProps} from '../features/types';
import {LANGS, type Translator} from '../i18n';
import {features, navAvailable} from './registry';

export type ShortcutView = {id: string; path: string; key: string; sequence: string; label: string};
export type AboutView = {
  title: string;
  close: string;
  duck: string;
  quack: string;
  tagline: string;
  credits: string;
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
  desc: string | undefined;
};
export type ShellView = {
  groups: Array<{id: string; label: string; items: NavItem[]}>;
  choices: Array<{id: string; label: string; desc: string | undefined}>;
  current: {id: string; path: string; title: string; hint: string | undefined; Page: ComponentType<PageProps>};
  content: {kind: 'login'; profileId: string; backend: string; rejected: boolean} | {kind: 'loading' | 'unavailable' | 'page'};
  busy: boolean;
  error: Error | null;
  engine: {text: string; href: string};
  about: AboutView;
  shortcuts: ShortcutView[];
  shortcutPaths: Record<string, string>;
};
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
  const feature = features.find(item => item.path === route) ?? features[0];
  const offered = (path: string) => navAvailable(path, capabilities);
  const groups = [...new Set(features.flatMap(item => (item.nav ? [item.nav.group] : [])))].map(group => ({
    id: group.replace('grp.', ''),
    label: t(group),
    items: features.flatMap(item =>
      item.nav?.group === group
        ? [
            {
              id: item.id,
              path: item.path,
              href: '#/' + item.path,
              label: t(item.nav.titleKey),
              Icon: item.nav.Icon,
              current: item.path === route,
              unavailable: !offered(item.path),
              description: offered(item.path) ? undefined : t('shell.notOffered'),
              desc: offered(item.path) ? undefined : t('shell.notOfferedShort')
            }
          ]
        : []
    )
  }));
  const needsToken = capabilityError instanceof ApiError && (capabilityError.status === 401 || capabilityError.status === 403);
  const content: ShellView['content'] =
    needsToken && feature.id !== 'settings'
      ? {kind: 'login', profileId: profile?.id ?? '', backend: profile?.name ?? profile?.api ?? '', rejected: !!profile?.token}
      : !capabilities && !capabilityError && feature.id !== 'settings'
        ? {kind: 'loading'}
        : capabilities && !offered(feature.path)
          ? {kind: 'unavailable'}
          : {kind: 'page'};
  const org = import.meta.env.VITE_ENGINE_ORG;
  const engineText = version ? `${version.engine.name} ${version.engine.version}` : '—';
  const build = version?.build?.revision ? ` (${version.build.revision.slice(0, 12)})` : '';
  const apiText = version ? `${version.api.name} v${version.api.major} · ${version.api.status}` : '—';
  const contractText = import.meta.env.VITE_DOONA_CONTRACT_COMMIT;
  const shortcuts = features.flatMap(item =>
    item.shortcut && item.nav && offered(item.path)
      ? [{id: item.id, path: item.path, key: item.shortcut, sequence: `g ${item.shortcut}`, label: t(item.nav.titleKey)}]
      : []
  );
  return {
    groups,
    choices: groups.flatMap(group => group.items.map(item => ({id: item.path, label: item.label, desc: item.desc}))),
    current: {
      id: feature.id,
      path: route,
      title: t(feature.nav?.titleKey ?? 'nav.activity'),
      hint: feature.nav?.hintKey ? t(feature.nav.hintKey) : undefined,
      Page: feature.Page
    },
    content,
    busy: !capabilities && !capabilityError,
    error: (content.kind === 'login' ? null : capabilityError) ?? versionError,
    engine: {text: engineText, href: version ? `${org}/${version.engine.name}` : org},
    shortcuts,
    shortcutPaths: Object.fromEntries(shortcuts.map(item => [item.key, item.path])),
    about: {
      title: t('about.title'),
      close: t('about.close'),
      duck: t('about.duck'),
      quack: t('about.quack'),
      tagline: t('about.tagline', {engine: org.split('/').pop()!}),
      credits: t('about.credits'),
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
export function wordmark(honked: boolean) {
  return honked ? 'doooooona' : 'doona';
}
export function duckView(taps: number) {
  const honked = taps >= 5;
  const painted = honked && (taps - 5) % 2 === 1;
  return {honked, painted, hop: taps > 0 && !painted, wordmark: wordmark(honked)};
}
// Each entry pairs the light variant with a dark one; the description names both with their official variant names.
export const palettes = (t: Translator): Array<{title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}> => [
  {
    title: t('palette.rosePine'),
    items: [
      {id: 'rose-pine/main', label: t('palette.rosePine'), desc: t('palette.dawnMain')},
      {id: 'rose-pine/moon', label: t('palette.moon'), desc: t('palette.dawnMoon')}
    ]
  },
  {
    title: t('palette.catppuccin'),
    items: [
      {id: 'catppuccin/frappe', label: t('palette.frappe'), desc: t('palette.latteFrappe')},
      {id: 'catppuccin/macchiato', label: t('palette.macchiato'), desc: t('palette.latteMacchiato')},
      {id: 'catppuccin/mocha', label: t('palette.mocha'), desc: t('palette.latteMocha')}
    ]
  },
  {title: t('palette.nord'), items: [{id: 'nord/nord', label: t('palette.nord'), desc: t('palette.nordVariants')}]},
  {title: t('palette.kary'), items: [{id: 'kary/kary', label: t('palette.kary'), desc: t('palette.lightDark')}]},
  {title: t('palette.antd'), items: [{id: 'antd/antd', label: t('palette.antd'), desc: t('palette.defaultDark')}]},
  {
    title: t('palette.bytedance'),
    items: [
      {id: 'arco/arco', label: t('palette.arco'), desc: t('palette.lightDark')},
      {id: 'semi/semi', label: t('palette.semi'), desc: t('palette.lightDark')}
    ]
  },
  {title: t('palette.glassName'), items: [{id: 'glass/glass', label: t('palette.glassName'), desc: t('palette.glass')}]}
];

export const languageItems = LANGS.map(([id, label]) => ({id, label}));
export function appearanceMenu(t: Translator, scheme: Scheme, dark: boolean) {
  return {
    wordmarks: [
      {id: 'gradient', label: t('wordmark.gradient')},
      {id: 'plain', label: t('wordmark.plain')}
    ],
    themeLabel: t('shell.theme', {theme: t(scheme === 'system' ? 'theme.system' : dark ? 'theme.dark' : 'theme.light')})
  };
}
