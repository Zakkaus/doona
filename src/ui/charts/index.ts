// Charts live here, built on d3-shape and the shared palette, tooltip and layout helpers.
// Pages use this entry point; never draw ad-hoc SVG charts or import chart libraries.
export {usePalette} from './palette';
export {AreaChart, Spark, Donut, Legend} from './Charts';
export {FactStrip, type ChartFact} from './FactStrip';
export {LegendItem} from './LegendItem';
export {Beeswarm, type SwarmPoint} from './Beeswarm';
export {Waffle} from './Waffle';
export {MarkerPlot} from './MarkerPlot';
export {Heatmap} from './Heatmap';
export {Scatter, ScatterLegend} from './Scatter';
