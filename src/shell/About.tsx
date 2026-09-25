import type {ReactElement} from 'react';
import {Button, Kv, Link, ModalDialog, cx} from '../ui/ui';
import logo from '../logo.svg';
import night from '../duck-night.webp';
import GitHub from '../ui/icons/GitHub';
import {useAbout} from './useShell';

export function About({trigger, onHonk}: {trigger: ReactElement; onHonk?: () => void}) {
  const view = useAbout(onHonk);
  return (
    <ModalDialog title={view.title} narrow trigger={trigger} footer={close => <Button onPress={close}>{view.close}</Button>}>
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
        <div className="rp-cluster">
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
