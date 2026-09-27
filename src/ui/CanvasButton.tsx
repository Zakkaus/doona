import type {Ref} from 'react';

// A native button that a canvas draws in full, for a surface that handles its own presses and keys, such as the game
// beside the sign-in form. It carries no kit look and no press handling of its own; the owner of the canvas wires both.
// A disabled one keeps its look but takes neither focus nor presses.
export function CanvasButton({
  label,
  className,
  isDisabled,
  ref,
  canvasRef
}: {
  label: string;
  className?: string;
  isDisabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
  canvasRef?: Ref<HTMLCanvasElement>;
}) {
  return (
    <button ref={ref} type="button" className={className} aria-label={label} disabled={isDisabled}>
      <canvas ref={canvasRef} />
    </button>
  );
}
