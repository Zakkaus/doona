import {useEffect, useMemo, useRef, useState} from 'react';
import {VisuallyHidden} from 'react-aria';
import {useT} from '../i18n';
import {CanvasButton} from '../ui/CanvasButton';
import logo from '../logo.svg';
import {startLoginGame, type GameText, type LoginGame} from './loginGame';

// The panel beside the sign-in form on wide screens: a construction scene that a press turns into a mini game (see
// loginGame.ts). The canvas is the button's content, so the panel has a name and works from the keyboard, and keys only
// reach it while it has focus. Each result is read out once through the live region.
export default function LoginShowcase() {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<LoginGame | null>(null);
  const [result, setResult] = useState<{amount: string; best: string} | null>(null);
  const text = useMemo<GameText>(
    () => ({
      sign: t('login.gameSign'),
      start: t('login.gameStart'),
      restart: t('login.gameRestart'),
      result: amount => t('login.gameResult', {amount}),
      best: amount => t('login.gameBest', {amount})
    }),
    [t]
  );
  useEffect(() => {
    const started = startLoginGame(button.current!, canvas.current!, logo, (amount, best) => setResult({amount, best}));
    game.current = started;
    return () => {
      started.destroy();
      game.current = null;
    };
  }, []);
  // Runs after the effect above on the first render, so the game has its text before it is first drawn.
  useEffect(() => game.current?.setText(text), [text]);
  return (
    <aside className="rp-login-showcase">
      <CanvasButton ref={button} canvasRef={canvas} className="rp-login-game" label={t('login.gameLabel')} />
      <VisuallyHidden aria-live="polite">{result && t('login.gameOver', result)}</VisuallyHidden>
    </aside>
  );
}
