import {useState, type ReactElement, type RefObject} from 'react';
import {Button, Divider, Kv, Light, Link, PopoverDialog} from '../ui/ui';
import {About} from './About';
import type {BackendView} from './view';

// A hover card of what the shell knows about the backend, then editing it in Settings, About doona and the engine's
// project page as menu rows.
// The About action closes the popover before the dialog opens, so focus has one place to return to.
function BackendFacts({backend, close, openAbout}: {backend: BackendView; close: () => void; openAbout: () => void}) {
  return (
    <>
      <Kv row items={backend.facts} />
      <Divider orientation="horizontal" />
      <div className="rp-backend-actions">
        <Link appearance="button" quiet href={backend.edit.href} onPress={close}>
          {backend.edit.label}
        </Link>
        <Button
          quiet
          onPress={() => {
            close();
            openAbout();
          }}
        >
          {backend.about}
        </Button>
        <Link appearance="button" quiet href={backend.project.href} external>
          {backend.project.label}
        </Link>
      </div>
    </>
  );
}

type Popover = {trigger: ReactElement} | {triggerRef: RefObject<Element | null>; isOpen: boolean; onOpenChange: (open: boolean) => void};
function BackendPopover({backend, honk, popover}: {backend: BackendView; honk: () => void; popover: Popover}) {
  const [about, setAbout] = useState(false);
  return (
    <>
      <PopoverDialog
        title={backend.heading}
        subtitle={
          <Light tone={backend.tone} small>
            {backend.state}
          </Light>
        }
        {...popover}
      >
        {close => <BackendFacts backend={backend} close={close} openAbout={() => setAbout(true)} />}
      </PopoverDialog>
      <About isOpen={about} onOpenChange={setAbout} onHonk={honk} />
    </>
  );
}

// The side navigation's corner, like an editor's remote indicator: the connection's light, then the engine and its version.
export function BackendIndicator({backend, honk}: {backend: BackendView; honk: () => void}) {
  return (
    <BackendPopover
      backend={backend}
      honk={honk}
      popover={{
        trigger: (
          <Button appearance="plain" className="rp-version" label={backend.label}>
            <Light tone={backend.tone} small>
              {null}
            </Light>
            {backend.text}
          </Button>
        )
      }}
    />
  );
}

// Below the side navigation's breakpoint a row of the overflow menu opens the same popover. It sits beside the menu's
// button, since the row has closed with the menu, and focus goes back to that button when it closes.
export function BackendMenuPopover({
  backend,
  honk,
  anchor,
  isOpen,
  onOpenChange
}: {
  backend: BackendView;
  honk: () => void;
  anchor: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const change = (open: boolean) => {
    onOpenChange(open);
    if (!open) anchor.current?.querySelector('button')?.focus();
  };
  return <BackendPopover backend={backend} honk={honk} popover={{triggerRef: anchor, isOpen, onOpenChange: change}} />;
}
