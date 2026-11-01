import {manualFields, manualInvalid, protocolName, protocols, type NodeFields} from '../../dae/nodeForm';
import {useT, type Key} from '../../i18n';
import {Checkbox, LabeledSelect, NumberField, numberFromText, TextField, textFromNumber, Toolbar} from '../../ui/ui';

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
  serviceName: 'nodes.manual.service',
  obfs: 'nodes.manual.obfs',
  'obfs-password': 'nodes.manual.obfsPassword',
  congestion_control: 'nodes.manual.congestion'
};

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
      {manualFields(draft).map(({key, options, flag, required}) => {
        const uuid = key === 'username' && draft.protocol !== 'socks5';
        const label = t(labels[uuid ? 'uuid' : key]);
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
          <Checkbox key={key} label={label} isSelected={!!draft[key]} isDisabled={isDisabled} onChange={on => onChange(key, on ? '1' : '')} />
        ) : (
          <TextField
            key={key}
            isRequired={required}
            isDisabled={isDisabled}
            label={label}
            value={draft[key] ?? ''}
            spellCheck={false}
            error={uuid && draft[key] && invalid.includes(key) ? t('nodes.manual.uuidInvalid') : undefined}
            onChange={value => onChange(key, value)}
          />
        );
      })}
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
