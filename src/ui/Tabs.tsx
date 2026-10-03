import {useDeferredValue, useState, type ReactNode} from 'react';
import {Tabs as RTabs, TabList, Tab, TabPanel} from 'react-aria-components';
import {TabShown} from './useTabShown';
import {useSlider, useScrollStrip} from './hooks';
import {useControlSize} from './controlSize';
import {Toolbar} from './Toolbar';

// Tabs: the selected key is the caller's (URL-backed); a panel mounts the first time it is selected.
export function Tabs({
  label,
  items,
  value,
  onChange,
  keepMounted,
  actions,
  page
}: {
  label: string;
  items: Array<{id: string; label: string; content: ReactNode}>;
  value: string;
  onChange: (id: string) => void;
  // Keep a panel mounted once opened, hidden while another is chosen, so coming back is instant. For panels that
  // browse data; a panel with drafts or editors unmounts, so nothing of it keeps running out of sight.
  keepMounted?: boolean;
  // Controls at the end of the tab row, such as a filter for the panel shown; they wrap under the tabs on a phone.
  // Passing the prop, even as null, keeps the row, so the tab bar is not remounted when the controls come and go.
  actions?: ReactNode;
  // A page's own tab row, measured as one of the page's toolbars. Its tabs are M, S2's compact Tabs height (32px).
  page?: boolean;
}) {
  // The marker sits beside the TabList: anything inside it joins the RAC collection and re-renders the tabs.
  const [ref, pos] = useSlider(value, '[data-selected]');
  const controlSize = useControlSize();
  // On a phone the bar scrolls: the selected tab stays in view and a faded end shows there are more tabs.
  useScrollStrip(ref, value);
  // The selected tab and its marker answer the click in the urgent render; a panel opened for the first time (a
  // table of log rows) mounts in the deferred one, so the click never waits for it.
  const shown = useDeferredValue(value);
  // Until a new panel has mounted, the one before it stays on screen in its own panel, neither moved nor remounted:
  // an empty panel for a frame would collapse the page, and a remount would redraw its placeholders. With
  // `keepMounted`, opened panels also stay mounted, hidden, while another is chosen.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([value]));
  const kept = keepMounted ? opened : new Set([shown]);
  if (keepMounted && !opened.has(shown)) setOpened(new Set([...opened, shown]));
  const visible = kept.has(value) ? value : shown;
  const bar = (
    <div className="rp-tabbar" ref={ref} data-size={controlSize} data-page-tabrow={page || undefined}>
      {pos && <span className="rp-slider" data-still={pos.still || undefined} style={{left: pos.x, width: pos.w}} />}
      <TabList aria-label={label} className="rp-tablist">
        {items.map(item => (
          <Tab key={item.id} id={item.id} className="rp-tab" data-size={controlSize}>
            {item.label}
          </Tab>
        ))}
      </TabList>
    </div>
  );
  return (
    <RTabs className="rp-tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      {actions === undefined ? (
        bar
      ) : (
        <Toolbar page={page} className="rp-tabhead">
          {bar}
          {actions}
        </Toolbar>
      )}
      {items
        .filter(item => kept.has(item.id) || item.id === shown)
        .map(item => (
          <TabPanel key={item.id} id={item.id} shouldForceMount className="rp-tabpanel" data-shown={item.id === visible || undefined}>
            <TabShown.Provider value={item.id === visible}>{item.content}</TabShown.Provider>
          </TabPanel>
        ))}
    </RTabs>
  );
}
