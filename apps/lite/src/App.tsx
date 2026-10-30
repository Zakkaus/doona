import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {Layout, LayoutContent, LayoutHeader, VStack} from '@astryxdesign/core/Layout';
import astryxZhCN from '@astryxdesign/core/locales/zh-CN.generated.js';
import astryxZhTW from '@astryxdesign/core/locales/zh-TW.generated.js';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Theme} from '@astryxdesign/core/theme';
import {Activity, lazy, memo, startTransition, Suspense, useContext, useEffect, useMemo, useState} from 'react';
import type {Connection} from './api';
import {PreferencesContext, type Mode} from './app/preferences';
import {Connect} from './Connect';
import {docsHref, type DocsAnchor} from './docs';
import {catalogs, LocaleContext, useMessages, type Locale, type MessageKey} from './i18n';
import {commandsChunk, settingsChunk, pageChunks, warmGlyphsDuringIdle} from './preload';
import {Shell, type Screen} from './Shell';
import {siteTheme} from './themes/site/site';
import {cancelPageCommands} from './ui/commands';
import {DraftContext} from './ui/draftGuard';
import {EditDialog} from './ui/EditDialog';
import {PageFrame} from './ui/PageFrame';
import {browserLocale, isTyping, shortcuts} from './ui/shortcuts';
import {ToastViewport} from './ui/ToastViewport';
import {usePageMotion} from './ui/usePageMotion';
const Demo = import.meta.env.VITE_LITE_DEMO === '1' ? lazy(() => import('./Demo')) : null;
const Groups = lazy(() => pageChunks.groups().then(module => ({default: memo(module.Groups)})));
const Nodes = lazy(() => pageChunks.nodes().then(module => ({default: memo(module.Nodes)})));
const Subscriptions = lazy(() => pageChunks.subscriptions().then(module => ({default: memo(module.Subscriptions)})));
const Routing = lazy(() => pageChunks.routing().then(module => ({default: memo(module.Routing)})));
const Dns = lazy(() => pageChunks.dns().then(module => ({default: memo(module.Dns)})));
const SettingsDialog = settingsChunk.Component;
const Commands = commandsChunk.Component;

const screens: Screen[] = ['groups', 'subscriptions', 'nodes', 'routing', 'dns'];
// What a page the backend does not offer needs, and the feature requirements section on enabling it.
const unavailable: Record<'nodes' | 'groups' | 'providers' | 'config', {need: MessageKey; docs: DocsAnchor}> = {
  nodes: {need: 'needNodes', docs: 'req-nodes'},
  providers: {need: 'needProviders', docs: 'req-nodes'},
  groups: {need: 'needGroups', docs: 'req-group-selection'},
  config: {need: 'needConfig', docs: 'req-config-edit'}
};
const messages = {'zh-CN': astryxZhCN, 'zh-TW': astryxZhTW};
function preference<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(`doona-lite.${key}`) as T;
    return choices.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(`doona-lite.${key}`, value);
  } catch {
    /* Preferences still apply to this visit. */
  }
}
function route(): Screen {
  const value = location.hash.slice(1) as Screen;
  return screens.includes(value) ? value : 'groups';
}

export default function App() {
  // Toasts rise above an open draft footer so they never cover its primary action.
  const [draftOffset, setDraftOffset] = useState(0);
  useEffect(() => {
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spacing-4')) || 0;
    const listener = (event: Event) => {
      const height = (event as CustomEvent<number>).detail;
      setDraftOffset(height ? height + gap : 0);
    };
    window.addEventListener('lite-draft-offset', listener);
    return () => window.removeEventListener('lite-draft-offset', listener);
  }, []);
  const [locale, setLocale] = useState<Locale>(() => preference('locale', ['en', 'zh-CN', 'zh-TW'], browserLocale(navigator.languages)));
  const [mode, setMode] = useState<Mode>(() => preference('theme', ['light', 'dark', 'system'], 'system'));
  const [screen, setScreen] = useState<Screen>(route);
  const [visited, setVisited] = useState<Set<Screen>>(() => new Set(['groups', route()]));
  if (!visited.has(screen)) setVisited(new Set([...visited, screen]));
  const [connection, setConnection] = useState<Connection | null>(null);
  const [endedAddress, setEndedAddress] = useState<string>();
  useEffect(() => {
    const ended = (event: Event) => {
      const endedConnection = (event as CustomEvent<Connection>).detail;
      if (endedConnection !== connection) return;
      setEndedAddress(endedConnection.address);
      setConnection(null);
    };
    window.addEventListener('lite-session-ended', ended);
    return () => window.removeEventListener('lite-session-ended', ended);
  }, [connection]);
  const [commands, setCommands] = useState<'palette' | 'help' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMounted, setSettingsMounted] = useState(false);
  if (settingsOpen && !settingsMounted) setSettingsMounted(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<Screen | null>(null);
  const t = catalogs[locale];
  const preferences = useMemo(
    () => ({
      locale,
      mode,
      setLocale: (value: Locale) => {
        setLocale(value);
        persist('locale', value);
      },
      setMode: (value: Mode) => {
        setMode(value);
        persist('theme', value);
      }
    }),
    [locale, mode]
  );
  useEffect(() => {
    const preload = (event: Event) => {
      const trigger = event.target instanceof Element ? event.target.closest('button') : null;
      const label = trigger?.getAttribute('aria-label');
      if (label === t.settings) void settingsChunk.preload().catch(() => {});
      if (label === t.globalSearch) void commandsChunk.preload().catch(() => {});
    };
    document.addEventListener('pointerenter', preload, true);
    document.addEventListener('focus', preload, true);
    return () => {
      document.removeEventListener('pointerenter', preload, true);
      document.removeEventListener('focus', preload, true);
    };
  }, [t]);
  useEffect(() => warmGlyphsDuringIdle(t.pending), [t.pending]);
  useEffect(() => {
    const changed = () => {
      const target = location.hash.slice(1);
      const anchor = screens.includes(target as Screen) ? null : document.getElementById(target);
      if (anchor) {
        history.replaceState(null, '', `#${screen}`);
        anchor.focus();
        return;
      }
      if (busy) history.replaceState(null, '', `#${screen}`);
      else if (dirty && route() !== screen) {
        const next = route();
        history.replaceState(null, '', `#${screen}`);
        setLeaving(next);
      } else startTransition(() => setScreen(route()));
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, [busy, screen, dirty]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.app;
  }, [locale, t.app]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !connection ||
        busy ||
        event.defaultPrevented ||
        event.isComposing ||
        isTyping(event.target) ||
        Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"]')).some(element => element.checkVisibility())
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        event.preventDefault();
        startTransition(() => setCommands('palette'));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '?') {
        event.preventDefault();
        setCommands('help');
        return;
      }
      if (!event.shiftKey && Object.hasOwn(shortcuts, event.key.toLowerCase())) {
        event.preventDefault();
        location.hash = shortcuts[event.key.toLowerCase() as keyof typeof shortcuts];
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [connection, busy]);
  return (
    <InternationalizationProvider locale={locale} messages={messages}>
      <LocaleContext value={locale}>
        <PreferencesContext value={preferences}>
          <Theme theme={siteTheme} mode={mode}>
            <ToastViewport position="bottomEnd" maxVisible={1} inset={draftOffset ? {bottom: draftOffset} : undefined}>
              {Demo && (
                <Suspense fallback={null}>
                  <Demo connection={connection} onConnect={setConnection} />
                </Suspense>
              )}
              {!connection ? (
                !Demo && (
                  <Connect
                    endedAddress={endedAddress}
                    setBusy={setBusy}
                    onConnect={next => {
                      startTransition(() => {
                        setEndedAddress(undefined);
                        setConnection(next);
                        setScreen('groups');
                      });
                      history.replaceState(null, '', '#groups');
                    }}
                  />
                )
              ) : (
                <DraftContext value={setDirty}>
                  <Shell
                    onCommands={() => startTransition(() => setCommands('palette'))}
                    setBusy={setBusy}
                    screen={screen}
                    busy={busy}
                    connection={connection}
                    onSettings={() => startTransition(() => setSettingsOpen(true))}
                  >
                    {screens
                      .filter(page => visited.has(page))
                      .map(page => {
                        const resource = page === 'subscriptions' ? 'providers' : page === 'routing' || page === 'dns' ? 'config' : page;
                        return (
                          <Activity key={page} mode={screen === page ? 'visible' : 'hidden'}>
                            {connection.capabilities.resources[resource].available ? (
                              <Suspense fallback={<PageFrame title={t[page]} description={t[`${page}Description`]} ready={false} content={null} />}>
                                {page === 'nodes' && <Nodes connection={connection} setBusy={setBusy} />}
                                {page === 'groups' && <Groups connection={connection} setBusy={setBusy} />}
                                {page === 'subscriptions' && <Subscriptions connection={connection} setBusy={setBusy} />}
                                {page === 'routing' && <Routing connection={connection} setBusy={setBusy} />}
                                {page === 'dns' && <Dns connection={connection} setBusy={setBusy} />}
                              </Suspense>
                            ) : (
                              <UnavailablePage title={t[page]} message={t[unavailable[resource].need]} docs={unavailable[resource].docs} />
                            )}
                          </Activity>
                        );
                      })}
                    {settingsMounted && (
                      <Suspense fallback={null}>
                        <SettingsDialog isOpen={settingsOpen} connection={connection} setBusy={setBusy} close={() => setSettingsOpen(false)} />
                      </Suspense>
                    )}
                    {commands && (
                      <Suspense fallback={null}>
                        <Commands
                          connection={connection}
                          close={() => setCommands(null)}
                          settings={() => setSettingsOpen(true)}
                          blocked={busy || dirty}
                          help={commands === 'help'}
                        />
                      </Suspense>
                    )}
                  </Shell>
                  <EditDialog
                    open={leaving !== null}
                    title={t.leaveDraftTitle}
                    close={() => {
                      cancelPageCommands();
                      setLeaving(null);
                    }}
                    pending={false}
                    label={t.discard}
                    confirm={() => {
                      window.dispatchEvent(new Event('lite-discard-draft'));
                      if (leaving) {
                        setScreen(leaving);
                        history.replaceState(null, '', `#${leaving}`);
                      }
                      setLeaving(null);
                      setDirty(false);
                    }}
                  >
                    <Text>{t.leaveDraftHelp}</Text>
                  </EditDialog>
                </DraftContext>
              )}
            </ToastViewport>
          </Theme>
        </PreferencesContext>
      </LocaleContext>
    </InternationalizationProvider>
  );
}

function UnavailablePage({title, message, docs}: {title: string; message: string; docs: DocsAnchor}) {
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const ready = true;
  const motion = usePageMotion(ready);
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader ref={motion.header}>
          <Heading level={1} tabIndex={-1}>
            {title}
          </Heading>
        </LayoutHeader>
      }
      content={
        <LayoutContent className="lite-page-content">
          <VStack ref={motion.body}>
            <EmptyState
              title={t.unsupported}
              description={message}
              actions={<Button label={t.docsLink} variant="secondary" href={docsHref(locale, docs)} target="_blank" />}
            />
          </VStack>
        </LayoutContent>
      }
    />
  );
}
