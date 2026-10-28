import {matchRegion, regions} from '../../../src/dae/regions';
import {boundedMemo} from '../../../src/features/shared/boundedMemo';

export const regionLabel = (iso: string, locale: string): string =>
  regions.find(([code]) => code === iso)?.[2]?.short[locale] ?? new Intl.DisplayNames([locale], {type: 'region'}).of(iso) ?? iso;

// Hold a full page of node names, so a refresh never evicts names it is about to ask for again.
export const regionOf = boundedMemo(matchRegion, 2048);
