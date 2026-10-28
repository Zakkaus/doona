import {matchRegion} from '../../dae/regions';
import {MAX_PAGE} from '../../store/cadence';
import {boundedMemo} from './boundedMemo';

// Hold a full page of node names, so a refresh never evicts names it is about to ask for again.
export const regionOf = boundedMemo(matchRegion, 2 * MAX_PAGE);
