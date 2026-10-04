// Puts text on the clipboard. The Clipboard API needs a secure context, which a router's plain-HTTP address is not, so
// a selected text area and the copy command stand in there. Resolves to whether the text was copied.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused, for example without focus: the copy command may still work.
  }
  // Selecting the text area moves focus to it; focus goes back once it is removed, so the keyboard stays where it was.
  const active = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (active instanceof HTMLElement && active.isConnected) active.focus({preventScroll: true});
  }
}
