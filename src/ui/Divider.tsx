import {Separator} from 'react-aria-components';

// S2 Divider: the vertical rule between toolbar groups, or a horizontal one between groups of content.
export const Divider = ({orientation = 'vertical'}: {orientation?: 'vertical' | 'horizontal'}) => (
  <Separator orientation={orientation} className={orientation === 'vertical' ? 'rp-vrule' : 'rp-hrule'} />
);
