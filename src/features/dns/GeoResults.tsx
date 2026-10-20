import {useState} from 'react';
import {Button, Card, Empty, Kv} from '../../ui/ui';
import {useT} from '../../i18n';
import type {GeodataCard} from './view';

// One results page; long category listings are sliced here instead of being
// truncated at the query layer.
const PAGE_SIZE = 500;

function GeoCard({card, onShow}: {card: GeodataCard; onShow: (code: string) => void}) {
  const t = useT();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(card.rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = card.rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  return (
    <Card className="rp-col">
      <div className="rp-row">
        <div className="rp-cluster">
          <h2 className="rp-h3">{card.title}</h2>
        </div>
      </div>
      <Kv inline items={card.fields} />
      {rows.length ? (
        <>
          <div className="rp-list">
            {rows.map(row => (
              <div key={row.id} className="rp-dns-answer">
                <span className="rp-code">{row.value}</span>
                <span className="meta">
                  {row.code && <span>{row.code}</span>}
                  {row.type && <span>{row.type}</span>}
                  {row.attrs && <span>{row.attrs}</span>}
                </span>
                {row.code && (
                  <Button quiet small onPress={() => onShow(row.code!)}>
                    {t('dns.geodataShowEntries')}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {pages > 1 && (
            <div className="rp-row">
              <Button quiet small isDisabled={current === 0} onPress={() => setPage(current - 1)}>
                {t('dns.geodataPrev')}
              </Button>
              <span className="meta">{t('dns.geodataPage', {page: current + 1, pages})}</span>
              <Button quiet small isDisabled={current >= pages - 1} onPress={() => setPage(current + 1)}>
                {t('dns.geodataNext')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <Empty>{card.empty}</Empty>
      )}
    </Card>
  );
}

// The geosite answer beside the DNS one: a find names every category holding
// the domain, a show lists the category's entries. A find row leads back into
// the same form as a category listing. The key resets a card's page when the
// result changes.
export function GeoResults({cards, onShow}: {cards: GeodataCard[]; onShow: (code: string) => void}) {
  if (cards.length === 0) return null;
  return (
    <div className="rp-col">
      {cards.map(card => (
        <GeoCard key={card.id} card={card} onShow={onShow} />
      ))}
    </div>
  );
}
