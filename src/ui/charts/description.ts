import {createContext, useContext} from 'react';

// The id of the card's note: a chart inside a card is described by it, so a screen reader that lands on the chart
// hears what it is drawn from.
export const ChartDescription = createContext<string | undefined>(undefined);
export const useChartDescription = () => useContext(ChartDescription);
