import {useEffect, useState} from 'react';
import {useCapabilities} from '../api/store';
import type {PageProps} from '../features/types';
import {useT} from '../i18n';
import {Button, ModalDialog} from '../ui/ui';
import {features, navAvailable} from './registry';

export function Shortcuts({go, openSearch, mac}: {go: PageProps['go']; openSearch: () => void; mac: boolean}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const capabilities = useCapabilities();
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
      const pending = prefixAt;
      reset();
      if (pending !== null && performance.now() - pending <= 800) {
        const page = features.find(feature => feature.shortcut === event.key && navAvailable(feature.path, capabilities.data));
        if (page) {
          event.preventDefault();
          go(page.path);
          return;
        }
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
  }, [go, openSearch, capabilities.data]);
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
        {features
          .filter(feature => feature.shortcut && navAvailable(feature.path, capabilities.data))
          .map(feature => (
            <div className="rp-row" key={feature.id}>
              <span>{t(feature.nav!.titleKey)}</span>
              <kbd className="rp-kbd">g {feature.shortcut}</kbd>
            </div>
          ))}
      </div>
    </ModalDialog>
  );
}
