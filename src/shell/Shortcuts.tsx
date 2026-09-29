import {useEffect, useState} from 'react';
import {useT} from '../i18n';
import {Button, ModalDialog} from '../ui/ui';
import type {ShortcutView} from './view';
import {isRoutePath, type PageProps} from './routes';
import {preloadSearch} from './search/load';
import {onOpenShortcuts} from './shortcuts';

export function Shortcuts({
  go,
  openSearch,
  refresh,
  mac,
  entries,
  paths
}: {
  go: PageProps['go'];
  openSearch: () => void;
  refresh: () => void;
  mac: boolean;
  entries: ShortcutView[];
  paths: Record<string, string>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenShortcuts(() => setOpen(true)), []);
  useEffect(() => {
    let prefixAt: number | null = null;
    const reset = () => {
      prefixAt = null;
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      // A held Ctrl or ⌘ preloads search wherever focus is, a field included.
      if (event.key === 'Control' || event.key === 'Meta') preloadSearch();
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest('input, textarea, select, [role="textbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')))
      ) {
        reset();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        reset();
        openSearch();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        reset();
        setOpen(true);
        return;
      }
      // The page's own filter field, where it has one.
      if (event.key === '/') {
        reset();
        const field = document.querySelector<HTMLInputElement>('.rp-content input[type="search"]');
        if (field) {
          event.preventDefault();
          field.focus();
          field.select();
        }
        return;
      }
      const pending = prefixAt;
      reset();
      if (pending !== null && performance.now() - pending <= 800) {
        const path = paths[event.key];
        if (path && isRoutePath(path)) {
          event.preventDefault();
          go(path);
          return;
        }
      }
      if (event.key === 'r') {
        event.preventDefault();
        reset();
        refresh();
        return;
      }
      if (event.key === 'g') {
        event.preventDefault();
        prefixAt = performance.now();
      }
    };
    addEventListener('keydown', onKey);
    addEventListener('blur', reset);
    addEventListener('focusin', reset);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('blur', reset);
      removeEventListener('focusin', reset);
    };
  }, [go, openSearch, refresh, paths]);
  const mod = mac ? '⌘' : `${t('shell.keyCtrl')} `;
  return (
    <ModalDialog
      title={t('shell.shortcuts')}
      isOpen={open}
      onOpenChange={setOpen}
      footer={() => <Button onPress={() => setOpen(false)}>{t('ui.close')}</Button>}
    >
      <div className="rp-shortcuts">
        <div>
          <section>
            <h3>{t('shell.shortcutGeneral')}</h3>
            <Row label={t('shell.shortcutSearch')} keys={[t(mac ? 'shell.macShortcut' : 'shell.shortcut')]} />
            <Row label={t('shell.shortcutHelp')} keys={['?']} />
            <Row label={t('shell.shortcutFilter')} keys={['/']} />
            <Row label={t('ui.refresh')} keys={['R']} />
          </section>
          <section>
            <h3>{t('shell.shortcutTables')}</h3>
            <Row label={t('shell.shortcutMove')} keys={['↑', '↓']} />
            <Row label={t('shell.shortcutSelect')} keys={[t('shell.keyEnter'), t('shell.keySpace')]} />
            <Row label={t('shell.shortcutClose')} keys={[t('shell.keyEsc')]} />
          </section>
          <section>
            <h3>{t('shell.shortcutEditor')}</h3>
            <Row label={t('shell.shortcutApply')} keys={[`${mod}S`]} />
            <Row label={t('shell.shortcutSearch')} keys={[`${mod}F`]} />
            <Row label={t('shell.shortcutLine')} keys={[`${mod}G`]} />
            <Row label={t('shell.shortcutComment')} keys={[`${mod}/`]} />
          </section>
        </div>
        <section>
          <h3>{t('shell.shortcutGoTo')}</h3>
          <p className="rp-label">{t('shell.shortcutSequence')}</p>
          {entries.map(entry => (
            <Row key={entry.id} label={entry.label} keys={entry.keys} />
          ))}
        </section>
      </div>
    </ModalDialog>
  );
}

// A label and its keys, one key cap each.
function Row({label, keys}: {label: string; keys: string[]}) {
  return (
    <div className="rp-row">
      <span>{label}</span>
      <span className="keys">
        {keys.map((key, index) => (
          <kbd className="rp-kbd" key={index}>
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}
