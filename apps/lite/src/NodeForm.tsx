import {numberPageStep} from './ui/numberPageStep';
import {Card} from '@astryxdesign/core/Card';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Grid} from '@astryxdesign/core/Grid';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useState, type ReactNode} from 'react';
import {useMessages} from './i18n';
import {
  advancedFields,
  congestionControls,
  emptyNode,
  manualFields,
  manualInvalid,
  nodeLink,
  obfsTypes,
  parseNodeLink,
  protocolName,
  protocols,
  securityOptions,
  settle,
  shadowsocksMethods,
  ssPlugins,
  transports,
  usesTls,
  vmessMethods,
  xhttpModes,
  type NodeDocument,
  type NodeFields,
  type Protocol
} from '../../../src/dae/nodeForm';
import {editorLayout} from './ui/editorLayout';
import {Crossfade} from './ui/motion';

export default function NodeForm({
  original = '',
  originalName = '',
  name,
  setName,
  change,
  disabled,
  isNameReadOnly = false
}: {
  original?: string;
  originalName?: string;
  name: string;
  setName: (value: string) => void;
  change: (link: string) => void;
  disabled: boolean;
  isNameReadOnly?: boolean;
}) {
  const t = useMessages();
  const initial = () => {
    try {
      return parseNodeLink(original);
    } catch {
      return {fields: emptyNode(), document: undefined};
    }
  };
  const [state, setState] = useState<{fields: NodeFields; document?: NodeDocument}>(initial);
  const [advanced, setAdvanced] = useState(false);
  const f = state.fields;
  const update = (key: string, value: string) => {
    const fields = settle({...f, [key]: value});
    if (key === 'security' && value !== 'reality') for (const inactive of ['pbk', 'sid', 'spx']) fields[inactive] = '';
    if (key === 'security' && value === 'none') for (const inactive of ['sni', 'alpn', 'insecure', 'pinSHA256', 'ech_config', 'flow']) fields[inactive] = '';
    if (key === 'type') {
      if (!['ws', 'xhttp'].includes(value)) for (const inactive of ['path', 'transportHost']) fields[inactive] = '';
      if (value !== 'grpc') fields.serviceName = '';
      if (value !== 'xhttp') for (const inactive of ['mode', 'extra']) fields[inactive] = '';
      if (value !== 'xhttp' && f.protocol !== 'tuic') fields.alpn = '';
    }
    if (key === 'mux') {
      if (value !== 'h2mux') fields.padding = '';
      if (value !== 'xray') for (const inactive of ['concurrency', 'xudpConcurrency', 'xudpProxyUDP443']) fields[inactive] = '';
    }
    if (key === 'plugin' && value !== f.plugin) fields['plugin-opts'] = '';
    setState({...state, fields});
    const complete = fields.host && fields.port && (fields.username || fields.password || fields.protocol === 'socks5');
    const incomplete = manualInvalid(fields).some(key => !['host', 'port', 'username', 'password'].includes(key));
    change(complete && !incomplete ? nodeLink(fields, state.document) : '');
  };
  const pluginOptions = (f['plugin-opts'] ?? '').split(';').filter(Boolean);
  const pluginValue = (key: string) => pluginOptions.find(item => item.split('=')[0] === key)?.slice(key.length + 1) ?? '';
  const pluginUpdate = (key: string, value: string | boolean) =>
    update(
      'plugin-opts',
      [...pluginOptions.filter(item => item.split('=')[0] !== key), ...(value ? [value === true ? key : `${key}=${value}`] : [])].join(';')
    );
  const fieldHelp: Record<string, string> = {
    host: t.nodeGuideHost,
    username: t.nodeGuideCredentials,
    password: t.nodeGuideCredentials,
    method: t.nodeGuideMethod,
    security: t.nodeGuideSecurity,
    type: t.nodeGuideType,
    sni: t.nodeGuideSni,
    alpn: t.nodeGuideAlpn,
    insecure: t.nodeGuideInsecure,
    pinSHA256: t.nodeGuidePin,
    ech_config: t.nodeGuideEch,
    pbk: t.nodeGuidePublicKey,
    sid: t.nodeGuideShortId,
    spx: t.nodeGuideSpider,
    transportHost: t.nodeGuideTransportHost,
    path: t.nodeGuidePath,
    serviceName: t.nodeGuideService,
    mode: t.nodeGuideMode,
    plugin: t.nodeGuidePlugin,
    'plugin-opts': t.nodeGuidePluginOptions,
    flow: t.nodeGuideFlow,
    packetEncoding: t.nodeGuidePacket,
    mux: t.nodeGuideMux,
    concurrency: t.nodeGuideConcurrency,
    xudpConcurrency: t.nodeGuideXudpConcurrency,
    xudpProxyUDP443: t.nodeGuideUdp443,
    obfs: t.nodeGuideObfs,
    'obfs-password': t.nodeGuideObfsPassword,
    upmbps: t.nodeGuideBandwidth,
    downmbps: t.nodeGuideBandwidth,
    mport: t.nodeGuideMport,
    mhop: t.nodeGuideMhop,
    mtu: t.nodeGuideMtu,
    initStreamReceiveWindow: t.nodeGuideWindow,
    initConnReceiveWindow: t.nodeGuideWindow,
    disablePathMTUDiscovery: t.nodeGuideDiscovery,
    congestion_control: t.nodeGuideCongestion,
    min_idle_session: t.nodeGuideMinIdle,
    idle_session_check_interval: t.nodeGuideIdleCheck,
    idle_session_timeout: t.nodeGuideIdleTimeout,
    port: t.nodeGuidePort,
    padding: t.nodeGuidePadding,
    pluginTls: t.nodeGuidePluginTls,
    pluginHost: t.nodeGuideTransportHost,
    pluginPath: t.nodeGuidePath,
    pluginObfs: t.nodeGuidePlugin
  };
  if (f.protocol === 'socks5') fieldHelp.username = fieldHelp.password = t.nodeGuideSocksCredentials;
  const guide = (key: string, control: ReactNode) => (
    <VStack key={key} gap={1} style={{minWidth: 0}}>
      {control}
      <Text type="supporting" color="secondary">
        {fieldHelp[key]}
      </Text>
    </VStack>
  );
  const text = (key: string, label = key) => guide(key, <TextInput label={label} value={f[key] ?? ''} onChange={v => update(key, v)} isDisabled={disabled} />);
  const choice = (key: string, options: string[], label = key) =>
    guide(
      key,
      <Selector
        key={key}
        label={label}
        value={f[key] ?? options[0]}
        options={options.map(value => ({value, label: value || t.none}))}
        onChange={v => update(key, v)}
        isDisabled={disabled}
      />
    );
  const flag = (key: string, label = key, on = '1') =>
    guide(
      key,
      <CheckboxInput
        key={key}
        label={label}
        value={['1', 'true'].includes(f[key])}
        onChange={v => update(key, v ? on : on === 'true' ? 'false' : '0')}
        isDisabled={disabled}
      />
    );
  const number = (key: string, [min, max]: [number, number]) => {
    const bounds = {min, max, step: key.includes('ReceiveWindow') ? 65536 : 1};
    const change = (value: number) => update(key, `${value}${key.startsWith('idle_session_') ? (f[key]?.match(/[a-z]+$/i)?.[0] ?? 's') : ''}`);
    return guide(
      key,
      <NumberInput
        key={key}
        label={key}
        value={f[key] ? Number.parseFloat(f[key]) : null}
        onChange={change}
        onKeyDown={numberPageStep(change, bounds)}
        {...bounds}
        isIntegerOnly
        isWheelEnabled={false}
        units={key === 'mhop' || key.startsWith('idle_session_') ? f[key]?.replace(/^[\d.]+/, '') || 's' : undefined}
        isDisabled={disabled}
      />
    );
  };
  const security = securityOptions(f.protocol);
  const flow = manualFields(f).find(({key}) => key === 'flow');
  return (
    <VStack gap={4}>
      <TextInput label={t.name} value={name} onChange={setName} isReadOnly={isNameReadOnly} isDisabled={disabled} />
      <Selector
        label={t.protocol}
        value={f.protocol}
        options={protocols.map(value => ({value, label: protocolName(value)}))}
        onChange={value => {
          setState({fields: emptyNode(value as Protocol)});
          change('');
        }}
        isDisabled={disabled || !!original}
      />
      <Crossfade swapKey={`${f.protocol}-${f.security}-${f.type}`} gap={4}>
        <Card padding={4} width="100%" variant="muted">
          <VStack gap={4}>
            <Heading level={3}>{t.nodeGuideConnection}</Heading>
            <Grid xstyle={editorLayout.members}>
              {text('host', t.serverHost)}
              {guide(
                'port',
                <NumberInput
                  label={t.serverPort}
                  value={Number(f.port) || 443}
                  onChange={v => update('port', String(v))}
                  min={1}
                  max={65535}
                  step={1}
                  onKeyDown={numberPageStep(v => update('port', String(v)), {min: 1, max: 65535})}
                  isIntegerOnly
                  isWheelEnabled={false}
                  isDisabled={disabled}
                />
              )}
              {['vmess', 'vless', 'tuic', 'juicity', 'socks5'].includes(f.protocol) && text('username', f.protocol === 'socks5' ? t.username : 'UUID')}
              {!['vmess', 'vless'].includes(f.protocol) && text('password', t.password)}
            </Grid>
          </VStack>
        </Card>
        {f.protocol !== 'socks5' && (
          <>
            <Card padding={4} width="100%" variant="muted">
              <VStack gap={4}>
                <Heading level={3}>{t.nodeGuideTransport}</Heading>
                <Grid xstyle={editorLayout.members}>
                  {f.protocol === 'ss' && (
                    <>
                      {choice('method', [...new Set([f.method, ...shadowsocksMethods])], t.cipher)}
                      {choice('plugin', [...new Set([...ssPlugins, ...(f.plugin ? [f.plugin] : [])])])}
                      {f.plugin && (
                        <>
                          {f.plugin === 'v2ray-plugin'
                            ? guide(
                                'pluginTls',
                                <CheckboxInput
                                  label="TLS"
                                  value={pluginOptions.includes('tls')}
                                  onChange={value => pluginUpdate('tls', value)}
                                  isDisabled={disabled}
                                />
                              )
                            : guide(
                                'pluginObfs',
                                <Selector
                                  label="obfs"
                                  value={pluginValue('obfs')}
                                  options={['http', 'tls'].map(value => ({value, label: value}))}
                                  onChange={value => pluginUpdate('obfs', value)}
                                  isDisabled={disabled}
                                />
                              )}
                          {guide(
                            'pluginHost',
                            <TextInput
                              label="Host"
                              value={pluginValue(f.plugin === 'v2ray-plugin' ? 'host' : 'obfs-host')}
                              onChange={value => pluginUpdate(f.plugin === 'v2ray-plugin' ? 'host' : 'obfs-host', value)}
                              isDisabled={disabled}
                            />
                          )}
                          {guide(
                            'pluginPath',
                            <TextInput
                              label="path"
                              value={pluginValue(f.plugin === 'v2ray-plugin' ? 'path' : 'obfs-path')}
                              onChange={value => pluginUpdate(f.plugin === 'v2ray-plugin' ? 'path' : 'obfs-path', value)}
                              isDisabled={disabled}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                  {f.protocol === 'vmess' && choice('method', vmessMethods, t.cipher)}
                  {security && choice('security', security, t.security)}
                  {usesTls(f) && text('sni', 'SNI')}
                  {f.security === 'reality' && (
                    <>
                      {text('pbk', t.publicKey)}
                      {text('sid', 'Short ID')}
                      {text('spx', 'SpiderX')}
                    </>
                  )}
                  {['vmess', 'vless', 'trojan'].includes(f.protocol) && (
                    <>
                      {choice('type', transports, t.transport)}
                      {['ws', 'xhttp'].includes(f.type) && (
                        <>
                          {text('transportHost', 'Host')}
                          {text('path')}
                        </>
                      )}
                      {f.type === 'grpc' && text('serviceName')}
                      {f.type === 'xhttp' && choice('mode', xhttpModes)}
                    </>
                  )}

                  {f.protocol === 'hysteria2' && (
                    <>
                      {choice('obfs', obfsTypes)}
                      {f.obfs && text('obfs-password')}
                    </>
                  )}

                  {f.protocol === 'tuic' && choice('congestion_control', congestionControls)}
                </Grid>
              </VStack>
            </Card>
            {(f.protocol !== 'ss' || f.plugin) && (
              <Card padding={4} width="100%" variant="muted">
                <VStack gap={4}>
                  <Heading level={3}>{t.nodeGuideAdvanced}</Heading>
                  <CheckboxInput label={t.advancedOptions} value={advanced} onChange={setAdvanced} />
                  <Text type="supporting" color="secondary">
                    {t.nodeGuideAdvancedHelp}
                  </Text>
                  {advanced && (
                    <Grid xstyle={editorLayout.members}>
                      {usesTls(f) && !state.document?.json && flag('insecure', t.skipVerify)}
                      {flow && choice('flow', flow.options!)}
                      {advancedFields(f)
                        .filter(({key}) => !state.document?.json || !['pinSHA256', 'ech_config'].includes(key))
                        .map(({key, options, flag: on, range}) =>
                          options ? choice(key, options) : on ? flag(key, key, on) : range ? number(key, range) : text(key, key === 'alpn' ? 'ALPN' : key)
                        )}
                    </Grid>
                  )}
                </VStack>
              </Card>
            )}
          </>
        )}
      </Crossfade>
      {original && (
        <HStack gap={2}>
          <Button
            label={t.resetOriginal}
            variant="secondary"
            size="sm"
            isDisabled={disabled}
            onClick={() => {
              const restored = initial();
              setState(restored);
              setName(originalName);
              change(original);
            }}
          />
        </HStack>
      )}
    </VStack>
  );
}
