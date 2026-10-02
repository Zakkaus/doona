import type {OutboundMode} from '../../dae/outboundMode';
import {useSharedControl} from '../../store/sharedControl';

export const useModeDraft = () => useSharedControl<OutboundMode | null>('mode-draft', null);
