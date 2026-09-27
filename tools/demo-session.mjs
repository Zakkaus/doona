// The mock asks for the demo account like a password backend; a session already in the tab skips the sign-in page.
// Passed to addInitScript, so it runs in the page and must not reach anything outside itself.
export function signInDemo() {
  const session = {profileId: 'demo', api: 'mock', token: 'demo-session-tools', expiresAt: new Date(Date.now() + 3600_000).toISOString()};
  localStorage.setItem('doona-profiles', JSON.stringify([{id: 'demo', name: 'Demo', api: 'mock', token: ''}]));
  localStorage.setItem('doona-profile', 'demo');
  sessionStorage.setItem('doona-session', JSON.stringify(session));
}
