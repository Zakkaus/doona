import {ToastViewport as AstryxToastViewport, type ToastViewportProps} from '@astryxdesign/core/Toast';
import {useLayoutEffect, useRef} from 'react';

function ToastLayer() {
  const marker = useRef<HTMLTemplateElement>(null);
  useLayoutEffect(() => {
    // Astryx 0.6.8 exposes no viewport ref or portal container.
    const anchor = marker.current!;
    const viewport = anchor.nextElementSibling as HTMLElement;
    const home = viewport.parentElement!;
    let stack: HTMLDialogElement[] = [];
    const sync = () => {
      const open = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog:modal'));
      stack = [...stack.filter(dialog => open.includes(dialog)), ...open.filter(dialog => !stack.includes(dialog))];
      const parent = stack.at(-1) ?? home;
      if (viewport.parentElement === parent) return;
      // A popover outside the active modal is inert, even above it in the top layer.
      viewport.hidePopover();
      if (parent === home) anchor.after(viewport);
      else parent.append(viewport);
      viewport.showPopover();
    };
    const observer = new MutationObserver(records => {
      if (
        records.some(
          record =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('dialog') || node.querySelector('dialog')))
        )
      )
        sync();
    });
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});
    sync();
    return () => {
      observer.disconnect();
      // Restore React's owned sibling before its tree is removed.
      if (viewport.parentElement !== home) {
        viewport.hidePopover();
        anchor.after(viewport);
        viewport.showPopover();
      }
    };
  }, []);
  return <template ref={marker} />;
}

export function ToastViewport({children, ...props}: ToastViewportProps) {
  return (
    <AstryxToastViewport {...props}>
      {children}
      <ToastLayer />
    </AstryxToastViewport>
  );
}
