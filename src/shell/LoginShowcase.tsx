import {useEffect, useMemo, useRef, useState} from 'react';
import {LOCALE, useLang, useT} from '../i18n';
import {CanvasButton} from '../ui/CanvasButton';
import {useMediaQuery} from '../ui/hooks';
import {VisuallyHidden} from '../ui/ui';
import {startLoginGame, type GameText, type LoginGame} from './loginGame';

// The panel beside the sign-in form on wide screens: a loading bar stuck at 99% that a press turns into a mini game (see
// loginGame.ts). The canvas is the button's content, so the panel has a name and works from the keyboard, and keys only
// reach it while it has focus. Each result is read out once through the live region. Under reduced motion the scene
// stands still and takes no presses, so the panel is a picture: the button is disabled and hidden from assistive
// technology until motion is allowed again.
export default function LoginShowcase() {
  const t = useT();
  const lang = useLang();
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<LoginGame | null>(null);
  const [result, setResult] = useState<{amount: string; best: string} | null>(null);
  const text = useMemo<GameText>(
    () => ({
      locale: LOCALE[lang],
      loading: t('login.gameLoading'),
      progress: t('login.gameProgress'),
      status: t('login.gameStatus'),
      start: t('login.gameStart'),
      restart: t('login.gameRestart'),
      result: amount => t('login.gameResult', {amount}),
      best: amount => t('login.gameBest', {amount})
    }),
    [t, lang]
  );
  useEffect(() => {
    const started = startLoginGame(button.current!, canvas.current!, (amount, best) => setResult({amount, best}));
    game.current = started;
    return () => {
      started.destroy();
      game.current = null;
    };
  }, []);
  // Runs after the effect above on the first render, so the game has its text before it is first drawn.
  useEffect(() => game.current?.setText(text), [text]);
  return (
    <aside className="rp-login-showcase" aria-hidden={still || undefined}>
      <CanvasButton ref={button} canvasRef={canvas} className="rp-login-game" label={t('login.gameLabel')} isDisabled={still} />
      <VisuallyHidden aria-live="polite">{result && t('login.gameOver', result)}</VisuallyHidden>
    </aside>
  );
}
