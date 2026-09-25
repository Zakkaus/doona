// Charts live here, built on d3-shape and the shared palette, tooltip and layout helpers.
// Pages use this entry point; never draw ad-hoc SVG charts or import chart libraries.
export {usePalette, type Palette} from './palette';
export {AreaChart, Spark, Donut, Legend} from './Charts';
export {FactStrip, type ChartFact} from './FactStrip';
export {LegendItem} from './LegendItem';
export {Beeswarm, type SwarmPoint, type SwarmMark, type SwarmRow} from './Beeswarm';
export {Waffle, type WaffleShare} from './Waffle';
export {MarkerPlot, type MarkerGroup, type MarkerRow, type MarkerKind} from './MarkerPlot';
export {Heatmap, type HeatRow} from './Heatmap';
export {Scatter, ScatterLegend, type ScatterPoint, type ScatterSeries} from './Scatter';
export {ShareBar, type ShareSegment} from './ShareBar';
