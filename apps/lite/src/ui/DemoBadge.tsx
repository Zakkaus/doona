import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack} from '@astryxdesign/core/Stack';
import {useState} from 'react';
import {useMessages} from '../i18n';
import {Close} from './icons';
import './demoBadge.css';

const key = 'doona-lite-demo-badge';

export function DemoBadge() {
  const t = useMessages();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === 'hidden';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <HStack className="lite-demo-badge" gap={0.5} vAlign="center">
      <a href="https://github.com/Zakkaus/doona">{t.demoBadge}</a>
      <IconButton
        label={t.hideDemoBadge}
        icon={<Icon icon={Close} />}
        variant="ghost"
        size="sm"
        style={{color: 'inherit'}}
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, 'hidden');
          } catch {
            // Dismissal still applies to this visit.
          }
        }}
      />
    </HStack>
  );
}
