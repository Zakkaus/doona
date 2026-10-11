import {useState} from 'react';
import {useT} from '../../i18n';
import {Disclosure, LabeledSelect, Switch, TextField, Toolbar} from '../../ui/ui';
import {readXhttp, writeXhttp, xhttpModes, type XhttpDownload, type XhttpFields} from '../../dae/xhttp';

// The XHTTP options of the link being typed. Each change rewrites the link, which remains what is saved and what
// honk validates; a link these fields cannot represent shows none of them.
export function XhttpOptions({link, onChange, isDisabled}: {link: string; onChange: (link: string) => void; isDisabled?: boolean}) {
  const t = useT();
  const fields = readXhttp(link);
  // A header without a name cannot live in the link yet, so typed rows stay here until they have one. Rows the link
  // would not write back unchanged were edited elsewhere, and the link's own headers replace them.
  const [rows, setRows] = useState<Array<[string, string]>>(fields?.headers ?? []);
  if (fields && writeXhttp(link, {...fields, headers: rows}) !== link) setRows(fields.headers);
  if (!fields) return null;
  const set = (patch: Partial<XhttpFields>) => onChange(writeXhttp(link, {...fields, ...patch}));
  const setDownload = (patch: Partial<XhttpDownload>) => {
    if (fields.download) set({download: {...fields.download, ...patch}});
  };
  const mode = fields.mode || 'auto';
  const setHeader = (index: number, name: string, value: string) => {
    const next = [...rows];
    next[index] = [name, value];
    const kept = next.filter(([rowName, rowValue]) => rowName || rowValue);
    setRows(kept);
    set({headers: kept});
  };
  return (
    <Disclosure title={t('nodes.xhttp.title')} flush>
      <span className="rp-label">{t('nodes.xhttp.help')}</span>
      <LabeledSelect
        label={t('nodes.xhttp.mode')}
        items={[...new Set([...xhttpModes, mode])].map(id => ({id, label: id}))}
        value={mode}
        isDisabled={isDisabled}
        onChange={next => next !== mode && set({mode: next})}
      />
      <Toolbar className="top">
        <TextField
          isDisabled={isDisabled}
          label={t('nodes.xhttp.path')}
          value={fields.path}
          placeholder="/"
          spellCheck={false}
          onChange={path => set({path})}
        />
        <TextField isDisabled={isDisabled} label={t('nodes.xhttp.host')} value={fields.host} spellCheck={false} onChange={host => set({host})} />
      </Toolbar>
      {[...rows, ['', ''] as [string, string]].map(([name, value], index) => (
        <Toolbar className="top" key={index}>
          <TextField
            isDisabled={isDisabled}
            label={t('nodes.xhttp.headerName', {n: index + 1})}
            value={name}
            spellCheck={false}
            onChange={next => setHeader(index, next, value)}
          />
          <TextField
            isDisabled={isDisabled}
            label={t('nodes.xhttp.headerValue', {n: index + 1})}
            value={value}
            spellCheck={false}
            onChange={next => setHeader(index, name, next)}
          />
        </Toolbar>
      ))}
      <Toolbar className="top">
        <TextField
          isDisabled={isDisabled}
          label={t('nodes.xhttp.padding')}
          value={fields.xPaddingBytes}
          placeholder="100-1000"
          onChange={xPaddingBytes => set({xPaddingBytes})}
        />
        <TextField
          isDisabled={isDisabled}
          label={t('nodes.xhttp.postBytes')}
          value={fields.scMaxEachPostBytes}
          placeholder="1000000"
          onChange={scMaxEachPostBytes => set({scMaxEachPostBytes})}
        />
        <TextField
          isDisabled={isDisabled}
          label={t('nodes.xhttp.postInterval')}
          value={fields.scMinPostsIntervalMs}
          placeholder="30"
          onChange={scMinPostsIntervalMs => set({scMinPostsIntervalMs})}
        />
      </Toolbar>
      <Switch isSelected={fields.noGRPCHeader} isDisabled={isDisabled} onChange={noGRPCHeader => set({noGRPCHeader})}>
        {t('nodes.xhttp.noGrpcHeader')}
      </Switch>
      <Switch
        isSelected={!!fields.download}
        isDisabled={isDisabled}
        description={t('nodes.xhttp.downloadHelp')}
        onChange={on => set({download: on ? {address: '', port: '443', serverName: '', path: '', host: ''} : null})}
      >
        {t('nodes.xhttp.download')}
      </Switch>
      {fields.download && (
        <>
          <Toolbar className="top">
            <TextField
              isDisabled={isDisabled}
              label={t('nodes.xhttp.downloadAddress')}
              value={fields.download.address}
              spellCheck={false}
              onChange={address => setDownload({address})}
            />
            <TextField
              isDisabled={isDisabled}
              label={t('nodes.xhttp.downloadPort')}
              value={fields.download.port}
              width={96}
              onChange={port => setDownload({port})}
            />
          </Toolbar>
          <TextField
            isDisabled={isDisabled}
            label={t('nodes.xhttp.downloadServerName')}
            value={fields.download.serverName}
            spellCheck={false}
            onChange={serverName => setDownload({serverName})}
          />
          <Toolbar className="top">
            <TextField
              isDisabled={isDisabled}
              label={t('nodes.xhttp.downloadPath')}
              value={fields.download.path}
              placeholder="/"
              spellCheck={false}
              onChange={path => setDownload({path})}
            />
            <TextField
              isDisabled={isDisabled}
              label={t('nodes.xhttp.downloadHost')}
              value={fields.download.host}
              spellCheck={false}
              onChange={host => setDownload({host})}
            />
          </Toolbar>
        </>
      )}
    </Disclosure>
  );
}
