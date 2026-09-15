import {useT} from '../../i18n';
import {useState} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {subs, geo} from './fixtures';
import {Button, DataTable, Kv, Light, Switch, toast} from '../../ui/ui';

export function Resources() {
  const t = useT();
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? subs.filter(s => !s.ready) : subs;
  const refreshable = subs.filter(s => s.refreshable);
  return (
    <div className="rp-page">
      <div className="rp-between">
        <Switch isSelected={onlyBad} onChange={setOnlyBad}>
          {t('resource.onlyBad')}
        </Switch>
        <Button accent onPress={() => toast('negative', t('resource.refreshFailed'))}>
          <Refresh />
          {t('resource.refreshAll', {n: refreshable.length})}
        </Button>
      </div>
      <DataTable
        label={t('resource.subscriptions')}
        height={192}
        rows={shown}
        empty={t('resource.allReady')}
        cols={[
          {id: 'n', label: t('ui.name'), width: 120, isRowHeader: true},
          {id: 'src', label: t('ui.source')},
          {id: 'st', label: t('ui.state'), width: 130},
          {id: 'try', label: t('resource.lastTry'), width: 110},
          {id: 'ok', label: t('resource.lastOk'), width: 110},
          {id: 'pub', label: t('resource.published'), width: 80},
          {id: 'nodes', label: t('resource.nodes'), width: 72, align: 'end'},
          {id: 'act', label: t('resource.refresh'), width: 96}
        ]}
        render={s => [
          s.name,
          <span className="rp-code">{s.source}</span>,
          <Light small tone={s.ready ? 'ok' : 'err'}>
            {s.ready ? t('resource.ready') : s.error || t('resource.notReady')}
          </Light>,
          s.lastTry,
          s.lastOk,
          s.published,
          s.nodes ?? '',
          <Button
            quiet
            icon
            small
            label={s.refreshable ? t('resource.refreshOne') : t('resource.local')}
            isDisabled={!s.refreshable}
            onPress={() =>
              toast(
                s.ready ? 'positive' : 'negative',
                s.ready ? t('resource.refreshed', {name: s.name, n: s.nodes ?? '—'}) : t('resource.failed', {name: s.name})
              )
            }
          >
            <Refresh />
          </Button>
        ]}
      />
      <div className="rp-cards">
        {geo.map(g => (
          <div key={g.name} className="rp-card">
            <div className="rp-between">
              <h3 className="rp-h3">{g.name}</h3>
              <Light tone={g.ready ? 'ok' : 'err'}>{t('resource.ready')}</Light>
            </div>
            <Kv items={[[t('resource.path'), g.path]]} />
            <Kv
              items={[
                [t('resource.size'), g.size],
                [t('resource.modified'), g.mtime]
              ]}
            />
            <span className="rp-label">{t('resource.readonly')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
