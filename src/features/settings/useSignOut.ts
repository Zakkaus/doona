import {useState} from 'react';
import {useT} from '../../i18n';
import {closeSession} from '../../api/auth';
import {clearSession, sessionToken} from '../../api/session';
import {clearProfileToken, isDemoApi, readProfiles} from '../../api/profiles';
import {toast, toastErrorDetail} from '../../ui/ui';
import {useLeave} from '../../shell/draft';
import {replaceRoute} from '../../shell/route';
import {defaultRoute} from '../../shell/routes';

// Offered while this tab holds a password session for the saved active profile, or that profile keeps a saved token.
export function useSignOut() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const leave = useLeave();
  const {profiles, activeId} = readProfiles();
  const profile = profiles.find(item => item.id === activeId);
  const session = profile?.api ? sessionToken(profile.id, profile.api) : null;
  // The demo ignores any token, so a stale one there is nothing to sign out of.
  const saved = !!profile?.token && !isDemoApi(profile.api);
  if (!profile || (!session && !saved)) return null;
  const failed = (error: unknown) => {
    setBusy(false);
    toast('negative', t('settings.signOutFailed'), toastErrorDetail(error, t));
  };
  const run = async () => {
    setBusy(true);
    if (session) {
      try {
        await closeSession(profile.api, session);
      } catch (error) {
        // The session stays usable on the backend, so it is kept here too rather than silently orphaned.
        failed(error);
        return;
      }
      clearSession();
    }
    // A saved token left behind would take over from the closed session and sign this tab straight back in.
    try {
      clearProfileToken(profile.id);
    } catch (error) {
      failed(error);
      return;
    }
    // Settings stays open without a credential, so the reload lands on a page that asks to sign in again.
    replaceRoute(defaultRoute);
    location.reload();
  };
  return {
    busy,
    // A token is a secret configured on the backend, not a session: signing out only forgets it here.
    tokenOnly: !session,
    // Unsaved changes elsewhere are answered for first; declining leaves the credentials and the button as they were.
    signOut: () => leave(() => void run())
  };
}
