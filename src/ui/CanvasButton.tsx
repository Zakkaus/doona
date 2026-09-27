import type {Ref} from 'react';

// A native button that a canvas draws in full, for a surface that handles its own presses and keys, such as the game
// beside the sign-in form. It carries no kit look and no press handling of its own; the owner of the canvas wires both.
export function CanvasButton({
  label,
  className,
  ref,
  canvasRef
}: {
  label: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  canvasRef?: Ref<HTMLCanvasElement>;
}) {
  return (
    <button ref={ref} type="button" className={className} aria-label={label}>
      <canvas ref={canvasRef} />
    </button>
  );
}
