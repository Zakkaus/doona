import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack} from '@astryxdesign/core/Stack';
import {useState} from 'react';
import {useMessages} from '../i18n';
import {Close} from './icons';
import './demoBadge.css';

// The demo is published beside the standard demo at /lite/; this switch moves between the two.
export function DemoBadge() {
  const t = useMessages();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <HStack className="lite-demo-badge" gap={0.5} vAlign="center">
      <a href="../">Standard</a>
      <a href="./" aria-current="page">
        Lite
      </a>
      <IconButton label={t.hideDemoBadge} icon={<Icon icon={Close} />} variant="ghost" size="sm" style={{color: 'inherit'}} onClick={() => setHidden(true)} />
    </HStack>
  );
}
