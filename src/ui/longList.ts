// A menu's list is capped at 360 px of 32 px rows (`.rp-menu-scroll`), so a list of user data longer than twelve items
// scrolls, and its menu or picker gets a filter field.
export const longList = (count: number) => count > 12;
