import {useT} from '../../i18n';
import {Button, InlineAlert} from '../../ui/ui';

// A draft whose file changed on disk while it was being edited. Saving waits until the person keeps the draft over
// the new text or discards it: here, or with the editor's own Cancel when it has one. `keep` is null when there is
// nothing left to keep the draft over, such as a section removed on disk.
export function ChangedOnDisk({message, busy, keep, discard}: {message: string; busy: boolean; keep: (() => void) | null; discard?: () => void}) {
  const t = useT();
  return (
    <InlineAlert
      action={
        (keep || discard) && (
          <span className="rp-toolbar">
            {keep && (
              <Button isDisabled={busy} onPress={keep}>
                {t('config.keepChanges')}
              </Button>
            )}
            {discard && (
              <Button isDisabled={busy} onPress={discard}>
                {t('config.discard')}
              </Button>
            )}
          </span>
        )
      }
    >
      {message}
    </InlineAlert>
  );
}
