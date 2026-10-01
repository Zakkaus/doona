import type {ReactNode} from 'react';

export function EditorOption({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="rp-module-option">
      <span className="rp-label">{label}</span>
      {children}
    </div>
  );
}
