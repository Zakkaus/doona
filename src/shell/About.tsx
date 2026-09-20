import {useState, type ReactElement} from 'react';
import {Link} from 'react-aria-components';
import {useT} from '../i18n';
import {useVersion} from '../api/store';
import {Button, Kv, ModalDialog, cx} from '../ui/ui';
import logo from '../logo.svg';
import GitHub from '../ui/icons/GitHub';

// The engine's home on GitHub follows the name the backend reports (honk today, dae later) under the
// organisation package.json names; the slug is what the page shows.
export function engineLinks(name: string | undefined) {
  const org = import.meta.env.VITE_ENGINE_ORG;
  const slug = `${org.split('/').pop()}${name ? '/' + name : ''}`;
  return {slug, repo: name ? `${org}/${name}` : org};
}

// The about box behind the brand: versions, licence, credits. The duck answers to taps; five of them and it honks.
export function About({trigger}: {trigger: ReactElement}) {
  const t = useT();
  const version = useVersion();
  const [taps, setTaps] = useState(0);
  const honked = taps >= 5;
  const engine = version.data ? `${version.data.engine.name} ${version.data.engine.version}` : '—';
  const org = import.meta.env.VITE_ENGINE_ORG;
  const build = version.data?.build?.revision ? ` (${version.data.build.revision.slice(0, 12)})` : '';
  return (
    <ModalDialog title={t('about.title')} narrow trigger={trigger} footer={close => <Button onPress={close}>{t('about.close')}</Button>}>
      <div className={cx('rp-about', honked && 'honked')}>
        <button type="button" className="rp-about-duck" onClick={() => setTaps(n => n + 1)} aria-label={t('about.duck')}>
          <img key={taps} src={logo} alt="" className={cx(taps > 0 && 'hop')} />
          {honked && <span className="rp-about-bubble">{t('about.quack')}</span>}
        </button>
        <div className="rp-about-name">
          <span className="rp-brand-text">
            <span>doona</span>
            <span className="rp-brand-version">v{import.meta.env.VITE_DOONA_VERSION}</span>
          </span>
          <span className="rp-label">{t('about.tagline', {engine: org.split('/').pop()!})}</span>
        </div>
        <Kv
          items={[
            [t('about.engine'), engine + build],
            [t('about.api'), version.data ? `${version.data.api.name} v${version.data.api.major} · ${version.data.api.status}` : '—'],
            [t('about.license'), 'GPL-3.0-only']
          ]}
        />
        <p className="rp-label">{t('about.credits')}</p>
        <div className="rp-cluster">
          <Link className="rp-link" href={import.meta.env.VITE_DOONA_REPO} target="_blank" rel="noreferrer">
            <GitHub />
            doona
          </Link>
          <Link className="rp-link" href={org} target="_blank" rel="noreferrer">
            <GitHub />
            {org.split('/').pop()}
          </Link>
        </div>
      </div>
    </ModalDialog>
  );
}
