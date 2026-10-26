import {Center} from '@astryxdesign/core/Center';
import {Text} from '@astryxdesign/core/Text';
import {useEffect, useState} from 'react';
import {connect, type Connection} from './api';
import {useMessages} from './i18n';
import {ReadState} from './ui';
import {DemoBadge} from './ui/DemoBadge';

export default function Demo({connection, onConnect}: {connection: Connection | null; onConnect: (connection: Connection) => void}) {
  const t = useMessages();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (connection) return;
    let active = true;
    void connect('mock', '').then(
      next => {
        if (active) onConnect(next);
      },
      error => {
        if (active) setError(error);
      }
    );
    return () => {
      active = false;
    };
  }, [connection, onConnect]);
  return (
    <>
      <DemoBadge />
      {!connection && (
        <Center axis="both" padding={6} style={{minHeight: '100dvh'}}>
          {error === undefined ? <Text role="status">{t.loading}</Text> : <ReadState error={error} reload={async () => location.reload()} />}
        </Center>
      )}
    </>
  );
}
