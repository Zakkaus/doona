import {useT} from '../../i18n';
import {useChartDescription} from './description';
import {ChartTip, useChartTip} from './tip';

export type ShareSegment = {id: string; label: string; count: number; color: string; text: string};

// One bar split by share, left to right from the largest, with the counts in the legend under it.
export function ShareBar({label, segments}: {label: string; segments: ShareSegment[]}) {
  const t = useT();
  const describedBy = useChartDescription();
  const {ref: tipRef, tip: tipState, show: showTip, hide: hideTip} = useChartTip();
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div className="rp-sharebar rp-chart-hover" ref={tipRef} onPointerLeave={hideTip}>
      <div
        className="bar"
        role="img"
        aria-label={t('ui.valuePair', {label, value: segments.map(segment => `${segment.label} ${segment.text}`).join(t('ui.separator'))})}
        aria-describedby={describedBy}
      >
        {/* An empty share has no part of the bar; the legend still lists it with its zero. */}
        {segments
          .filter(segment => segment.count > 0 || !total)
          .map(segment => (
            <i
              key={segment.id}
              style={{flexGrow: total ? segment.count : 1, background: segment.color}}
              onPointerMove={event => showTip(event, [segment.label, segment.text])}
            />
          ))}
      </div>
      <ul className="legend">
        {segments.map(segment => (
          <li key={segment.id}>
            <i className="sw" style={{background: segment.color}} />
            <span>{segment.label}</span>
            <b>{segment.text}</b>
          </li>
        ))}
      </ul>
      <ChartTip tip={tipState} />
    </div>
  );
}
