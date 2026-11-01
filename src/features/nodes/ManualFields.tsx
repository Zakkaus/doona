import {advancedFields, manualFields, manualInvalid, type ManualField, protocolName, protocols, type NodeFields} from '../../dae/nodeForm';
import {useT, type Key} from '../../i18n';
import {Checkbox, Disclosure, LabeledSelect, NumberField, numberFromText, TextField, textFromNumber, Toolbar} from '../../ui/ui';

const labels: Record<string, Key> = {
  username: 'login.username',
  uuid: 'nodes.manual.uuid',
  flow: 'nodes.manual.flow',
  password: 'login.password',
  method: 'nodes.manual.method',
  security: 'nodes.manual.security',
  sni: 'nodes.manual.sni',
  insecure: 'nodes.manual.insecure',
  pbk: 'nodes.manual.publicKey',
  sid: 'nodes.manual.shortId',
  type: 'nodes.manual.transport',
  transportHost: 'nodes.xhttp.host',
  path: 'nodes.xhttp.path',
  mode: 'nodes.xhttp.mode',
  serviceName: 'nodes.manual.service',
  obfs: 'nodes.manual.obfs',
  'obfs-password': 'nodes.manual.obfsPassword',
  congestion_control: 'nodes.manual.congestion'
};
// Protocol terms and option names that honk's links spell out stay as they are: a field without a label here is named by its key.
const terms: Record<string, string> = {alpn: 'ALPN', spx: 'SpiderX', ech_config: 'ECH config'};

// The manual tab of the add dialog: the fields manualFields lists for the chosen protocol, and the link they make.
export function ManualFields({
  draft,
  link,
  nameError,
  linkError,
  isDisabled,
  onChange
}: {
  draft: NodeFields;
  link: string;
  nameError?: string;
  linkError?: string;
  isDisabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const t = useT();
  const invalid = manualInvalid(draft);
  const choice = (id: string) => ({id, label: id === '' ? t('ui.none') : id});
  const advanced = advancedFields(draft);
  const field = ({key, options, flag, required, range}: ManualField) => {
    const uuid = key === 'username' && draft.protocol !== 'socks5';
    const label = labels[uuid ? 'uuid' : key] ? t(labels[uuid ? 'uuid' : key]) : (terms[key] ?? key);
    return options ? (
      <LabeledSelect
        key={key}
        label={label}
        items={options.map(choice)}
        value={draft[key] ?? options[0]}
        isDisabled={isDisabled}
        onChange={value => onChange(key, value)}
      />
    ) : flag ? (
      <Checkbox key={key} label={label} isSelected={!!draft[key]} isDisabled={isDisabled} onChange={on => onChange(key, on ? flag : '')} />
    ) : range ? (
      <NumberField
        key={key}
        isRequired={required}
        isDisabled={isDisabled}
        label={label}
        value={numberFromText(draft[key] ?? '')}
        minValue={range[0]}
        maxValue={range[1]}
        step={1}
        error={draft[key] && invalid.includes(key) ? t('nodes.manual.valueInvalid') : undefined}
        onChange={value => onChange(key, textFromNumber(value))}
      />
    ) : (
      <TextField
        key={key}
        isRequired={required}
        isDisabled={isDisabled}
        label={label}
        value={draft[key] ?? ''}
        spellCheck={false}
        error={draft[key] && invalid.includes(key) ? t(uuid ? 'nodes.manual.uuidInvalid' : 'nodes.manual.valueInvalid') : undefined}
        onChange={value => onChange(key, value)}
      />
    );
  };
  return (
    <>
      <LabeledSelect
        label={t('ui.protocol')}
        items={protocols.map(id => ({id, label: protocolName(id)}))}
        value={draft.protocol}
        isDisabled={isDisabled}
        onChange={value => onChange('protocol', value)}
      />
      <TextField isRequired isDisabled={isDisabled} label={t('ui.name')} value={draft.name} error={nameError} onChange={value => onChange('name', value)} />
      <Toolbar className="top">
        <TextField
          isRequired
          isDisabled={isDisabled}
          label={t('nodes.manual.host')}
          value={draft.host}
          spellCheck={false}
          error={draft.host && invalid.includes('host') ? t('nodes.manual.hostInvalid') : undefined}
          onChange={value => onChange('host', value)}
        />
        <NumberField
          isRequired
          isDisabled={isDisabled}
          label={t('nodes.manual.port')}
          width={120}
          value={numberFromText(draft.port)}
          minValue={1}
          maxValue={65535}
          step={1}
          error={invalid.includes('port') ? t('nodes.manual.portInvalid') : undefined}
          onChange={value => onChange('port', textFromNumber(value))}
        />
      </Toolbar>
      {manualFields(draft).map(field)}
      {advanced.length > 0 && (
        <Disclosure title={t('nodes.manual.advanced')}>
          <div className="rp-list">{advanced.map(field)}</div>
        </Disclosure>
      )}
      {link && (
        <div className="rp-field">
          <span className="rp-label">{t('nodes.manual.generated')}</span>
          <span className="rp-code rp-node-link">{link}</span>
        </div>
      )}
      {linkError && <p className="rp-field-error">{linkError}</p>}
    </>
  );
}
