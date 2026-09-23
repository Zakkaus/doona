import {createContext, useContext} from 'react';

// The ids of the card's answer and sample line: a chart inside a card is described by them, so a screen reader that
// lands on the chart hears what it says and what it is drawn from.
export const ChartDescription = createContext<string | undefined>(undefined);
export const useChartDescription = () => useContext(ChartDescription);
