import {memo} from 'react';
import {ToggleButton} from 'react-aria-components';
import {Badge, Button, cx} from '../../ui/ui';
import type {RoutingTree} from './map';
import type {TreePlacement, TileView} from './view';
import {useTree} from './useTree';

// Views, placements and callbacks keep their identity across hover and pin changes, so only a tile whose dim or selected state flips rerenders.
const TreeTile = memo(function TreeTile({
  view,
  style,
  dim,
  selected,
  pin,
  hover
}: {
  view: TileView;
  style: TreePlacement;
  dim: boolean;
  selected: boolean;
  pin: (id: string) => void;
  hover: (id: string | null) => void;
}) {
  return (
    <ToggleButton
      aria-label={view.label}
      className={cx('rp-tree-tile', dim && 'dim')}
      data-id={view.id}
      data-stage={view.stage}
      style={style}
      isSelected={selected}
      onChange={() => pin(view.id)}
      onHoverStart={() => hover(view.id)}
      onHoverEnd={() => hover(null)}
      onFocus={() => hover(view.id)}
      onBlur={() => hover(null)}
    >
      <span className="l">
        {view.stage === 'rule' || view.stage === 'client' ? view.name : <b>{view.name}</b>}
        {view.notes.map((note, i) => (
          <span className={cx('s', note.tone)} key={i}>
            {note.text}
          </span>
        ))}
      </span>
      {view.badge && <Badge>{view.badge}</Badge>}
      <span className="c">{view.countText}</span>
    </ToggleButton>
  );
});

export default function Tree({tree, pinned, onPin}: {tree: RoutingTree; pinned: string | null; onPin: (id: string | null) => void}) {
  const {ref, ...model} = useTree(tree, pinned, onPin);
  return (
    <div className="rp-tree" ref={ref}>
      <div className="rp-tree-captions" style={{width: model.width}}>
        {model.captions.map(caption => (
          <span className="rp-label" key={caption.stage} style={caption.style}>
            {caption.label}
          </span>
        ))}
      </div>
      <div className="rp-tree-canvas" style={{height: model.height, width: model.width}}>
        {model.ready && (
          <svg className="rp-tree-links" width={model.width} height={model.height} aria-hidden>
            {model.geometry.map(edge => (
              <path
                key={edge.id}
                d={edge.path}
                strokeWidth={edge.width}
                data-kind={edge.kind}
                data-state={model.active ? (model.active.edges.has(edge.link) ? 'active' : 'dim') : undefined}
                strokeDasharray={edge.dash}
              />
            ))}
          </svg>
        )}
        {model.ready &&
          model.placed.map(({view, style}) => (
            <TreeTile
              key={view.id}
              view={view}
              style={style}
              dim={!!model.active && !model.active.items.has(view.id)}
              selected={model.pinned === view.id}
              pin={model.pin}
              hover={model.hover}
            />
          ))}
      </div>
      {model.more && (
        <Button small quiet onPress={model.showMore}>
          {model.more}
        </Button>
      )}
      {model.fewer && (
        <Button small quiet onPress={model.showFewer}>
          {model.fewer}
        </Button>
      )}
    </div>
  );
}
