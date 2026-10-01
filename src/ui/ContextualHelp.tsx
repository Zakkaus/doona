import {useCallback, useState, type ReactNode} from 'react';
import InfoCircle from './icons/InfoCircle';
import {useT} from '../i18n';
import {Button} from './Button';
import {PopoverDialog} from './Dialog';

// What a help popover explains: the title names the term or the state, and each string is one paragraph.
export type Help = {title: string; text: string | string[]};

// An info button beside a label that opens its explanation in a popover, after S2's ContextualHelp: for a term or a
// state the label alone cannot explain. The popover holds text only, so it needs no action to close.
export function ContextualHelp({
  title,
  text,
  icon = <InfoCircle />,
  label,
  size = 'label',
  boundaryElement
}: Help & {icon?: ReactNode; label?: string; size?: 'label' | 'control'; boundaryElement?: Element}) {
  const t = useT();
  return (
    <PopoverDialog
      title={title}
      placement="bottom start"
      boundaryElement={boundaryElement}
      trigger={
        <Button quiet icon className={size === 'control' ? 'rp-help rp-help-control' : 'rp-help'} label={label ?? t('ui.helpFor', {name: title})}>
          {icon}
        </Button>
      }
    >
      {() => (typeof text === 'string' ? [text] : text).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </PopoverDialog>
  );
}

// A status explanation stays inside the content column even when its trigger is near an edge.
export function IconTip({label, text, children}: {label: string; text: string; children: ReactNode}) {
  const [boundaryElement, setBoundaryElement] = useState<Element>();
  const boundary = useCallback((element: HTMLSpanElement | null) => {
    setBoundaryElement(element?.closest('.rp-content') ?? undefined);
  }, []);
  return (
    <span className="rp-icontip" ref={boundary}>
      <ContextualHelp title={label} label={label} text={text} icon={children} boundaryElement={boundaryElement} />
    </span>
  );
}

// A label, a heading or a status with its help button after it, on one row. The row stays when there is no help, so the
// label sits the same either way. A clipped cell passes fill: the text then gives way with an ellipsis and the help
// button stays in view.
export function HelpRow({help, fill, size, children}: {help?: Help | null; fill?: boolean; size?: 'label' | 'control'; children: ReactNode}) {
  return (
    <span className={fill ? 'rp-help-row rp-help-row-fill' : 'rp-help-row'}>
      {fill ? <span className="rp-help-text">{children}</span> : children}
      {help && <ContextualHelp {...help} size={size} />}
    </span>
  );
}
