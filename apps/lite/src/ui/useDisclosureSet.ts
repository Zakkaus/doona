import {useEffect, useState} from 'react';
export function useDisclosureSet(key: string) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...open]));
    } catch {
      /* Disclosure still works without storage. */
    }
  }, [key, open]);
  return [open, setOpen] as const;
}
