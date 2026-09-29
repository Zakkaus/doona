import {createContext, useContext} from 'react';
import type {Translator} from '../../i18n';

// The id of the card's note: a chart inside a card is described by it, so a screen reader that lands on the chart
// hears what it is drawn from.
export const ChartDescription = createContext<string | undefined>(undefined);
export const useChartDescription = () => useContext(ChartDescription);

export const shareDescription = (label: string, shares: Array<{label: string; text: string}>, t: Translator) =>
  t('ui.valuePair', {label, value: shares.map(share => t('ui.chartPart', {label: share.label, value: share.text})).join(t('ui.separator'))});
