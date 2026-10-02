import type {ReactElement} from 'react';
import {Button, Kv, Link, ModalDialog, cx, phoneQuery, useMediaQuery} from '../ui/ui';
import logo from '../logo.svg';
import night from '../duck-night.webp';
import GitHub from '../ui/icons/GitHub';
import FileText from '../ui/icons/FileText';
import {useAbout} from './useShell';

// Opened by its own trigger, or, without one, by the caller through `isOpen`, as the backend indicator does.
export function About({
  trigger,
  isOpen,
  onOpenChange,
  onHonk
}: {
  trigger?: ReactElement;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onHonk?: () => void;
}) {
  const view = useAbout(onHonk);
  const phone = useMediaQuery(phoneQuery);
  return (
    <ModalDialog
      title={view.title}
      narrow
      // On a phone the content scrolls between the title and Close; wider, the dialog keeps its own anatomy.
      scrollBody={phone}
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={close => <Button onPress={close}>{view.close}</Button>}
    >
      <div className={cx('rp-about', view.honked && 'honked')}>
        <Button appearance="plain" className={cx('rp-about-duck', view.painted && 'painted')} onPress={view.tap} label={view.duck}>
          <img key={view.taps} src={logo} alt="" className={cx(view.hop && 'hop')} />
          {/* Fetched on the first tap, well before the painting fades in, rather than with every open of the dialog. */}
          <img src={view.taps > 0 ? night : undefined} alt="" className="night" />
          {view.honked && <span className="rp-about-bubble">{view.quack}</span>}
        </Button>
        <div className="rp-about-name">
          <span className="rp-brand-text">
            <span>{view.wordmark}</span>
            <span className="rp-brand-version">{view.versionText}</span>
          </span>
          <span className="rp-label">{view.tagline}</span>
        </div>
        <Kv items={view.items} />
        <p className="rp-label">{view.credits}</p>
        <p className="rp-label">{view.privacy}</p>
        <div className="rp-cluster rp-about-links">
          <Link appearance="link" href={view.guide.href} external>
            <FileText />
            {view.guide.label}
          </Link>
          {view.repositories.map(repository => (
            <Link key={repository.href} appearance="link" href={repository.href} external>
              <GitHub />
              {repository.label}
            </Link>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
}
