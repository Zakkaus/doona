import {useT, useLang, LOCALE} from '../../i18n';
import Add from '../../ui/icons/Add';
import LinkIcon from '../../ui/icons/Link';
import {useClients} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {Button, DataTable} from '../../ui/ui';
import {RuleDialog} from '../activity/RuleDialog';
import type {PageProps} from '../types';

export function Clients({go}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const clients = useClients();
  return (
    <div className="rp-page">
      <p className="rp-note">{t('client.note')}</p>
      {clients.error && <p role="alert">{clients.error.message}</p>}
      {clients.data?.truncated && <p className="rp-note">{t('client.truncated')}</p>}
      <DataTable
        label={t('nav.clients')}
        height={300}
        empty={clients.loading ? t('ui.loading') : t('client.empty')}
        rows={clients.rows}
        cols={[
          {id: 'ip', label: t('ui.sourceIp'), width: 150, isRowHeader: true},
          {id: 'active', label: t('client.active'), width: 100, align: 'end'},
          {id: 'download', label: t('client.download'), width: 110, align: 'end'},
          {id: 'outbound', label: t('ui.outbound')},
          {id: 'first', label: t('client.firstSeen'), width: 190},
          {id: 'act', label: t('ui.actions'), width: 230}
        ]}
        render={c => [
          <span className="rp-code">{c.ip}</span>,
          c.active,
          formatBytes(c.download),
          c.outbounds || '—',
          <span title={c.firstSeen}>{localTime(c.firstSeen, locale)}</span>,
          <span className="rp-group-btns">
            <Button small onPress={() => go('connections', 'src=' + encodeURIComponent(c.ip))}>
              <LinkIcon />
              {t('nav.connections')}
            </Button>
            <RuleDialog
              trigger={
                <Button small>
                  <Add />
                  {t('ui.addRule')}
                </Button>
              }
              presets={[{label: t('ui.sourceValue', {source: c.ip}), cond: 'sip(' + c.ip.replace(/^\[|\]$/g, '') + ')'}]}
            />
          </span>
        ]}
      />
    </div>
  );
}
