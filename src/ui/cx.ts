export const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');
