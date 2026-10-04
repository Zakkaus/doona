import {GridList, GridListItem} from 'react-aria-components';
import type {ReactNode} from 'react';
import {useT} from '../i18n';
import {cardClass} from './Card';
import {Empty, Loading} from './Feedback';
import {TextTooltip} from './Tooltip';

// S2's CardView with highlight selection: a grid of cards of which one is selected, drawn with S2's dark stroke round
// the card. The arrow keys move between cards and select the one they reach; within a card, left and right also reach
// its actions. Cards in a row share its height.
export function CardView<T extends {id: string}>({
  label,
  items,
  selected,
  onSelect,
  loading,
  empty,
  children
}: {
  label: string;
  items: T[];
  selected: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  empty?: string;
  children: (item: T) => ReactNode;
}) {
  const t = useT();
  return (
    <GridList
      className="rp-cardview"
      aria-label={label}
      layout="grid"
      items={items}
      dependencies={[children]}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={selected ? [selected] : []}
      onSelectionChange={keys => {
        if (keys === 'all') return;
        const id = [...keys][0];
        if (id != null) onSelect(String(id));
      }}
      renderEmptyState={() => (loading ? <Loading /> : <Empty>{empty ?? t('ui.empty')}</Empty>)}
    >
      {children}
    </GridList>
  );
}

// One card of a CardView, as S2's Card: the title, which shows `titleFull` as a tooltip, with the card's actions at the
// end of its line, then `meta` (badges, a status light) as the description, then the body.
export function CardViewItem({
  id,
  title,
  titleFull,
  meta,
  actions,
  children
}: {
  id: string;
  title: string;
  titleFull?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <GridListItem id={id} textValue={title} className={cardClass('rp-cardview-card')}>
      <div className="rp-cardview-head">
        <TextTooltip className="rp-cardview-title" text={titleFull}>
          {title}
        </TextTooltip>
        {actions && <span className="rp-cardview-actions">{actions}</span>}
      </div>
      {meta && <div className="rp-cardview-meta">{meta}</div>}
      {children}
    </GridListItem>
  );
}
