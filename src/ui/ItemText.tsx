import {type ReactNode} from 'react';
import {Text} from 'react-aria-components';
import {TextTooltip} from './Tooltip';
import {NodeName} from './NodeName';

export type Item = {id: string; label: string; desc?: string; icon?: ReactNode; nodeName?: boolean; flag?: string | null; aside?: boolean};
export const ItemLabel = ({i, cut, reserveFlag = false}: {i: Item; reserveFlag?: boolean; cut?: 'start' | 'path'}) => {
  const split = cut === 'path' ? i.label.lastIndexOf('/') + 1 : 0;
  return (
    <span className="rp-il">
      {(i.flag || (reserveFlag && i.flag !== undefined)) && <span className="rp-node-flag" data-flag={i.flag} aria-hidden="true" />}
      {i.icon && <span className="ic">{i.icon}</span>}
      {i.nodeName ? (
        <NodeName name={i.label} cut={cut === 'start' ? cut : undefined} />
      ) : split ? (
        <TextTooltip className="rp-path" text={i.label}>
          <span className="rp-truncate rp-truncate-start">
            <bdi>{i.label.slice(0, split)}</bdi>
          </span>
          <bdi>{i.label.slice(split)}</bdi>
        </TextTooltip>
      ) : (
        <TextTooltip cut={cut === 'start' ? cut : undefined} tooltipText={i.label}>
          {i.label}
        </TextTooltip>
      )}
    </span>
  );
};
// S2 descriptions sit below the label and grow with their content. The label slot names the item apart from its
// description, which is announced as the description. An `aside` description stays on the label's row, at its end.
export const ItemText = ({i, children}: {i: Item; children?: ReactNode}) => (
  <span className="rp-item-text">
    <Text slot="label" elementType="span">
      <ItemLabel i={i} reserveFlag />
    </Text>
    {children ??
      (i.desc && (
        <Text slot="description" className={i.aside ? 'desc aside' : 'desc'}>
          {i.desc}
        </Text>
      ))}
  </span>
);
