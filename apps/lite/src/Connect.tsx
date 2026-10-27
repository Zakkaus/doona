import {useEffect, useEffectEvent, useRef, useState} from 'react';
import {Center} from '@astryxdesign/core/Center';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {normalizeApi} from '../../../src/api/profiles';
import {openSession, type SignIn} from '../../../src/api/auth';
import {ApiError} from '../../../src/api/error';
import {credentialProblems, resolveSignInKind, secondsLeft, signInRefusal} from '../../../src/shell/useLogin';
import {connect, LiteError, type Connection} from './api';
import {clearConnection, readConnection} from './connectionStore';
import {connectionStartup} from './connectionStartup';
import {useMessages, type MessageKey} from './i18n';
import {noticeText, useTask} from './state';
import {Feedback} from './ui';
import {LanguageMenu} from './ui/LanguageMenu';
import {ColorModeToggle} from './ui/ColorModeToggle';
import {BrandMark} from './ui/BrandMark';
import {usePageMotion} from './ui/usePageMotion';

export function Connect({
  onConnect,
  setBusy,
  endedAddress
}: {
  onConnect: (connection: Connection) => void;
  setBusy: (busy: boolean) => void;
  endedAddress?: string;
}) {
  const t = useMessages();
  const [saved] = useState(readConnection);
  const [probing, setProbing] = useState(!saved && !endedAddress && import.meta.env.VITE_LITE_DEMO !== '1');
  const [hosted, setHosted] = useState(false);
  const [address, setAddress] = useState(endedAddress ?? (saved?.address !== 'mock' ? saved?.address : '') ?? '');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [kind, setKind] = useState<SignIn | 'no-api' | null>(null);
  const [problems, setProblems] = useState<ReturnType<typeof credentialProblems>>({});
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const task = useTask(setBusy);
  const restored = useRef(false);
  const ready = !probing;
  const motion = usePageMotion(ready);
  const wait = secondsLeft(until, now);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setNow(Date.now()), (until - now) % 1000 || 1000);
    return () => clearTimeout(timer);
  }, [wait, until, now]);
  const message = (key: string) => t[key as MessageKey] ?? t.failed;
  const discover = async () => {
    let base: string;
    try {
      base = normalizeApi(address);
      if (!base || base === 'mock') throw new Error();
    } catch {
      throw new LiteError('invalidUrl');
    }
    setAddress(base);
    const nextKind = await resolveSignInKind(base);
    setKind(nextKind);
    if (nextKind === 'no-api') throw new LiteError('login.noApi');
    return nextKind;
  };
  const restore = useEffectEvent(() => {
    if (endedAddress) {
      void task.run('backend', async () => {
        await discover();
        return undefined;
      });
      return;
    }
    if (saved?.address === 'mock' || import.meta.env.VITE_LITE_DEMO === '1') return;
    void task.run('backend', async () => {
      let connected = false;
      try {
        const next = await connectionStartup(saved, import.meta.env.VITE_LITE_DEMO === '1', location);
        if (next && 'connection' in next) {
          onConnect(next.connection);
          connected = true;
        } else if (next) {
          setAddress(next.address);
          setKind(next.kind);
          setHosted(next.kind !== 'no-api');
          if (next.kind === 'no-api') throw new LiteError('login.noApi');
        }
      } catch (error) {
        if (saved && error instanceof ApiError && error.status === 401) {
          clearConnection(saved);
          await discover();
          throw new LiteError('login.sessionEnded');
        }
        throw error;
      } finally {
        if (!connected) setProbing(false);
      }
      return undefined;
    });
  });
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    restore();
  }, []);
  const start = () =>
    void task.run('backend', async () => {
      if (wait) return;
      if (kind === null || kind === 'no-api') {
        await discover();
        return;
      }
      let credential = token.trim();
      if (kind === 'login' || kind === 'setup') {
        const found = credentialProblems(kind, username, password, confirm);
        setProblems(found);
        if (Object.keys(found).length) return;
        try {
          credential = (await openSession(address, kind, {username, password})).token;
        } catch (error) {
          const refusal = signInRefusal(error, kind);
          if (!refusal) throw error;
          if (refusal.switchTo) {
            setKind(refusal.switchTo);
            setConfirm('');
          }
          if (refusal.wait) {
            const at = Date.now();
            setNow(at);
            setUntil(at + refusal.wait * 1000);
          }
          // Feedback uses lite's catalogue; the shared helper chooses the refusal and its parameters.
          return {
            error: new LiteError(refusal.key as MessageKey),
            values: Object.fromEntries(Object.entries(refusal.params ?? {}).map(([key, value]) => [key, String(value)]))
          };
        }
      }
      onConnect(await connect(address, credential));
      setToken('');
      setPassword('');
      setConfirm('');
    });
  const editAddress = (value: string) => {
    setAddress(value);
    setKind(null);
    setProblems({});
    setToken('');
    setPassword('');
    setConfirm('');
    setUntil(0);
  };
  const edit = (field: 'username' | 'password' | 'confirm', set: (value: string) => void) => (value: string) => {
    set(value);
    setProblems(previous => ({...previous, [field]: undefined}));
  };
  const submitLabel = wait
    ? noticeText(wait === 1 ? t['login.retryInOne'] : t['login.retryIn'], {n: String(wait)})
    : kind === 'setup'
      ? t['login.create']
      : kind === 'login'
        ? t['login.signIn']
        : kind === 'token'
          ? t.connectButton
          : t['login.check'];
  if (probing)
    return (
      <Center axis="both" padding={6} style={{minHeight: '100dvh'}}>
        <Text role="status">{t.loading}</Text>
      </Center>
    );
  return (
    <Center axis="both" padding={6} style={{minHeight: '100dvh', backgroundColor: 'var(--color-background-body)'}}>
      <VStack ref={motion.body} gap={4} hAlign="center" width="100%" maxWidth={400}>
        <VStack gap={2} hAlign="center">
          {/* The duck is an illustration, not a line icon: it needs more than an icon size to read. */}
          <BrandMark style={{width: 'calc(var(--spacing-12) + var(--spacing-4))', height: 'calc(var(--spacing-12) + var(--spacing-4))'}} />
          <Text weight="bold" size="lg">
            {t.app}
          </Text>
        </VStack>
        <Card padding={8} width="100%">
          <VStack gap={4}>
            <VStack gap={1} hAlign="center">
              <Heading level={1}>{kind === 'setup' ? t['login.setupTitle'] : kind === 'login' || kind === 'token' ? t['login.signIn'] : t.connect}</Heading>
              <Text color="secondary" type="supporting" justify="center">
                {kind === 'setup' ? t.setupDescription : kind === 'login' ? t.signInDescription : kind === 'token' ? t.tokenDescription : t.connectDescription}
              </Text>
            </VStack>
            <Feedback notice={task.notice ?? (endedAddress ? {error: new LiteError('login.sessionEnded')} : undefined)} />
            <VStack
              as="form"
              gap={4}
              onKeyDown={event => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
              }}
              onSubmit={event => {
                event.preventDefault();
                start();
              }}
            >
              {!hosted && (
                <FormLayout defaultOptionality="required">
                  <TextInput
                    label={t.backend}
                    isLabelHidden
                    placeholder={t.backend}
                    description={t.backendHelp}
                    size="lg"
                    value={address}
                    onChange={editAddress}
                    width="100%"
                    isRequired
                    isDisabled={task.busy !== null}
                    autoComplete="url"
                  />
                </FormLayout>
              )}
              {(kind === 'login' || kind === 'setup') && (
                <VStack gap={4}>
                  <TextInput
                    label={t['login.username']}
                    size="lg"
                    value={username}
                    onChange={edit('username', setUsername)}
                    width="100%"
                    isDisabled={task.busy !== null}
                    autoComplete="username"
                    status={problems.username ? {type: 'error', message: message(problems.username)} : undefined}
                  />
                  <TextInput
                    label={t['login.password']}
                    size="lg"
                    type="password"
                    value={password}
                    onChange={edit('password', setPassword)}
                    width="100%"
                    isDisabled={task.busy !== null}
                    autoComplete={kind === 'setup' ? 'new-password' : 'current-password'}
                    status={problems.password ? {type: 'error', message: message(problems.password)} : undefined}
                  />
                  {kind === 'setup' && (
                    <TextInput
                      label={t['login.confirm']}
                      size="lg"
                      type="password"
                      value={confirm}
                      onChange={edit('confirm', setConfirm)}
                      width="100%"
                      isDisabled={task.busy !== null}
                      autoComplete="new-password"
                      status={problems.confirm ? {type: 'error', message: message(problems.confirm)} : undefined}
                    />
                  )}
                </VStack>
              )}
              {kind === 'token' && (
                <TextInput
                  label={t.token}
                  isLabelHidden
                  placeholder={t.token}
                  description={t.tokenHelp}
                  size="lg"
                  type="password"
                  value={token}
                  onChange={setToken}
                  width="100%"
                  isDisabled={task.busy !== null}
                  autoComplete="off"
                />
              )}
              <Button
                label={submitLabel}
                variant="primary"
                size="lg"
                type="submit"
                isDisabled={task.busy !== null || wait > 0}
                isLoading={task.busy === 'backend'}
              />
            </VStack>
            {hosted && (
              <Button
                label={t.useAnotherBackend}
                variant="ghost"
                size="lg"
                isDisabled={task.busy !== null}
                onClick={() => {
                  setHosted(false);
                  editAddress('');
                }}
              />
            )}
          </VStack>
        </Card>
        <HStack gap={2}>
          <LanguageMenu />
          <ColorModeToggle />
        </HStack>
      </VStack>
    </Center>
  );
}
