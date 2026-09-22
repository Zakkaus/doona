import {useState} from 'react';
import {useT} from '../../i18n';
import {closeSession} from '../../api/auth';
import {clearSession, sessionToken} from '../../api/session';
import {readProfiles} from '../../api/profiles';
import {toast} from '../../ui/ui';
import {errorText} from '../../api/error';

// Offered only while this tab holds a password session for the saved active profile.
export function useSignOut() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const {profiles, activeId} = readProfiles();
  const profile = profiles.find(item => item.id === activeId);
  const token = profile?.api ? sessionToken(profile.id, profile.api) : null;
  if (!profile || !token) return null;
  return {
    busy,
    signOut: async () => {
      setBusy(true);
      try {
        await closeSession(profile.api, token);
      } catch (error) {
        // The session stays usable on the backend, so it is kept here too rather than silently orphaned.
        setBusy(false);
        toast('negative', t('settings.signOutFailed', {error: errorText(error, t)}));
        return;
      }
      clearSession();
      location.reload();
    }
  };
}
