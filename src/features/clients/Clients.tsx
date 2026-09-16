import {useT, useLang, LOCALE} from '../../i18n';
import LinkIcon from '../../ui/icons/Link';
import {useClients} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime} from '../../api/selectors';
import {Button, DataTable, ErrorMessage, TextTooltip} from '../../ui/ui';
import type {PageProps} from '../types';

export function Clients({go}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const clients = useClients();
  return (
    <div className="rp-page">
      <p className="rp-note">{t('client.note')}</p>
      {clients.error && <ErrorMessage error={clients.error} />}
      {clients.data?.truncated && <p className="rp-note">{t('client.truncated')}</p>}
      <DataTable
        label={t('nav.clients')}
        height={300}
        loading={clients.loading && !clients.data}
        empty={t('client.empty')}
        rows={clients.rows}
        cols={[
          {id: 'ip', label: t('ui.sourceIp'), minWidth: 136, isRowHeader: true},
          {id: 'active', label: t('client.active'), minWidth: 64, grow: 0, align: 'end'},
          {id: 'download', label: t('client.download'), minWidth: 80, grow: 0, align: 'end'},
          {id: 'outbound', label: t('ui.outbound'), minWidth: 88},
          {id: 'first', label: t('client.firstSeen'), minWidth: 144},
          {id: 'act', label: t('ui.actions'), minWidth: 152, grow: 0}
        ]}
        render={c => [
          <TextTooltip className="rp-code">{c.ip}</TextTooltip>,
          c.active,
          formatBytes(c.download),
          c.outbounds || '—',
          <TextTooltip text={c.firstSeen}>{localTime(c.firstSeen, locale)}</TextTooltip>,
          <span className="rp-group-btns">
            <Button small onPress={() => go('connections', 'src=' + encodeURIComponent(c.ip))}>
              <LinkIcon />
              {t('nav.connections')}
            </Button>
          </span>
        ]}
      />
    </div>
  );
}
