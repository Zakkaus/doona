import type {ReactNode} from 'react';
import InfoCircle from './icons/InfoCircle';
import {useT} from '../i18n';
import {Button} from './Button';
import {PopoverDialog} from './Dialog';

// What a help popover explains: the title names the term or the state, and each string is one paragraph.
export type Help = {title: string; text: string | string[]};

// An info button beside a label that opens its explanation in a popover, after S2's ContextualHelp: for a term or a
// state the label alone cannot explain. The popover holds text only, so it needs no action to close.
export function ContextualHelp({title, text}: Help) {
  const t = useT();
  return (
    <PopoverDialog
      title={title}
      placement="bottom start"
      trigger={
        <Button quiet icon className="rp-help" label={t('ui.helpFor', {name: title})}>
          <InfoCircle />
        </Button>
      }
    >
      {() => (typeof text === 'string' ? [text] : text).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </PopoverDialog>
  );
}

// A label, a heading or a status with its help button after it, on one row. The row stays when there is no help, so the
// label sits the same either way.
export function HelpRow({help, children}: {help?: Help | null; children: ReactNode}) {
  return (
    <span className="rp-help-row">
      {children}
      {help && <ContextualHelp {...help} />}
    </span>
  );
}
