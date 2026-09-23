// The one chart entry point: pages take charts and the palette from here and never import a chart library.
export {usePalette, type Palette} from './palette';
export {AreaChart, Spark, Donut, Legend} from './Recharts';
export {ChartCard, FactStrip, LegendItem, type ChartFact} from './ChartCard';
export {Beeswarm, type SwarmPoint, type SwarmMark, type SwarmRow} from './Beeswarm';
export {Waffle, type WaffleShare} from './Waffle';
export {MarkerPlot, type MarkerGroup, type MarkerRow, type MarkerKind} from './MarkerPlot';
export {Heatmap, type HeatRow} from './Heatmap';
export {Scatter, ScatterLegend, type ScatterPoint, type ScatterSeries} from './Scatter';
export {ShareBar, type ShareSegment} from './ShareBar';
