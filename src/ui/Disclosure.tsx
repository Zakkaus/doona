import {type ComponentProps, type ReactNode} from 'react';
import {Button as RButton, Disclosure as RDisclosure, DisclosurePanel, Heading} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {cx} from './cx';

// `flush` aligns the chevron with the content; `aside` keeps a status beside the trigger; `compact` spaces the content
// as a dialog's list is.
export function Disclosure({
  title,
  flush,
  aside,
  compact,
  variant,
  children,
  ...props
}: Omit<ComponentProps<typeof RDisclosure>, 'children'> & {
  title: ReactNode;
  flush?: boolean;
  aside?: ReactNode;
  compact?: boolean;
  variant?: 'nav';
  children: ReactNode;
}) {
  return (
    <RDisclosure {...props} className="rp-disclosure" data-variant={variant} data-compact={compact || undefined}>
      <Heading level={3} className={aside ? 'rp-disclosure-head' : undefined}>
        <RButton slot="trigger" className={cx('rp-disclosure-trigger', variant === 'nav' ? 'rp-group' : 'rp-btn quiet', flush && 'flush')}>
          <ChevronDown />
          <span className="rp-disclosure-title">{title}</span>
        </RButton>
        {aside}
      </Heading>
      <DisclosurePanel className="rp-disclosure-panel">
        <div className="rp-disclosure-content">{children}</div>
      </DisclosurePanel>
    </RDisclosure>
  );
}
