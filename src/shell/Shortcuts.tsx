import {useEffect, useState} from 'react';
import type {PageProps} from '../features/types';
import {useT} from '../i18n';
import {Button, ModalDialog} from '../ui/ui';
import type {ShortcutView} from './view';

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
  useEffect(() => {
    let prefixAt: number | null = null;
    const reset = () => {
      prefixAt = null;
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
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
        const field = document.querySelector<HTMLInputElement>('.rp-content input[type="search"]');
        if (field) {
          event.preventDefault();
          reset();
          field.focus();
          field.select();
        }
        return;
      }
      const pending = prefixAt;
      reset();
      if (pending !== null && performance.now() - pending <= 800) {
        const path = paths[event.key];
        if (path) {
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
  return (
    <ModalDialog
      title={t('shell.shortcuts')}
      isOpen={open}
      onOpenChange={setOpen}
      narrow
      footer={() => <Button onPress={() => setOpen(false)}>{t('close')}</Button>}
    >
      <p className="rp-note">{t('shell.shortcutSequence')}</p>
      <div className="rp-col">
        <div className="rp-row">
          <span>{t('search')}</span>
          <kbd className="rp-kbd">{t(mac ? 'shell.macShortcut' : 'shell.shortcut')}</kbd>
        </div>
        <div className="rp-row">
          <span>{t('shell.shortcutHelp')}</span>
          <kbd className="rp-kbd">?</kbd>
        </div>
        <div className="rp-row">
          <span>{t('shell.shortcutFilter')}</span>
          <kbd className="rp-kbd">/</kbd>
        </div>
        <div className="rp-row">
          <span>{t('refresh')}</span>
          <kbd className="rp-kbd">r</kbd>
        </div>
        {entries.map(entry => (
          <div className="rp-row" key={entry.id}>
            <span>{entry.label}</span>
            <kbd className="rp-kbd">{entry.sequence}</kbd>
          </div>
        ))}
      </div>
      <p className="rp-note">{t('shell.shortcutTables')}</p>
      <p className="rp-note">{t(mac ? 'shell.shortcutEditorMac' : 'shell.shortcutEditor')}</p>
    </ModalDialog>
  );
}
