import {useT} from '../../i18n';
import {useState} from 'react';
import {sources, diagnostics, runtime} from './fixtures';
import {Badge, Button, DaeLine, Frame, LabeledSelect, Line, Switch, TextArea, toast} from '../../ui/ui';
import type {PageProps} from '../types';

export function ConfigPage({query, go}: PageProps) {
  const t = useT();
  const q = new URLSearchParams(query);
  const wanted = sources.find(s => s.path.endsWith(q.get('src') || '#'));
  const [srcId, setSrcId] = useState(wanted ? wanted.id : 'main');
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    if (!dirty && wanted) {
      setSrcId(wanted.id);
      setEdit(false);
    }
  }
  const src = sources.find(s => s.id === srcId)!;
  const errs = diagnostics.filter(d => d.source === src.id && d.level === 'error');
  const startEdit = (on: boolean) => {
    setEdit(on);
    if (on) setText(src.lines.join('\n'));
  };
  return (
    <div className="rp-page">
      <div className="rp-split">
        <div className="rp-col">
          <div className="rp-between">
            <div className="rp-cluster">
              <LabeledSelect
                label={t('ui.source')}
                side
                value={srcId}
                onChange={k => {
                  setSrcId(k);
                  setEdit(false);
                  setDirty(false);
                }}
                items={sources.map(s => ({id: s.id, label: s.path}))}
              />
              <Badge>{t('ui.diskRevision', {n: runtime.diskRevision})}</Badge>
              <Badge>{t('ui.activeRevision', {n: runtime.activeRevision})}</Badge>
              {dirty && <Badge tone="warn">{t('config.unsaved')}</Badge>}
            </div>
            <div className="rp-group-btns">
              <Button secondary onPress={() => go('validate')}>
                {t('config.validate')}
                {errs.length > 0 && <span className="rp-count">{errs.length}</span>}
              </Button>
              <Button primary onPress={() => toast('neutral', t('config.reloaded', {revision: runtime.diskRevision}))}>
                {t('config.reload')}
              </Button>
              <Button
                accent
                isDisabled={!dirty}
                onPress={() => {
                  setDirty(false);
                  toast('positive', t('config.applied', {revision: runtime.diskRevision + 1}));
                }}
              >
                {t('config.applyReload')}
              </Button>
            </div>
          </div>
          {errs.map(e => {
            const [h, b] = e.msg.split('；');
            return (
              <div key={e.line} className="rp-alert">
                <span className="h">{t('config.lineError', {n: e.line, error: h})}</span>
                <span className="b">{b ?? e.why}</span>
              </div>
            );
          })}
          {edit ? (
            <TextArea
              label={t('ui.source')}
              value={text}
              onChange={v => {
                setText(v);
                setDirty(true);
              }}
            />
          ) : (
            <Frame title={src.path} actions={<span>{t(src.editable ? 'config.editableLines' : 'config.readonlyLines', {n: src.lines.length})}</span>}>
              {src.lines.map((l, i) => (
                <Line key={i} n={i + 1} err={errs.some(e => e.line === i + 1)}>
                  <DaeLine text={l} />
                </Line>
              ))}
            </Frame>
          )}
        </div>
        <div className="rp-col">
          <div className="rp-card">
            <Switch isSelected={edit} onChange={startEdit} isDisabled={!src.editable}>
              {t('config.lossless')}
            </Switch>
            <span className="rp-label">{t('config.secrets')}</span>
          </div>
          <div className="rp-card">
            <h3 className="rp-h3">{t('config.external')}</h3>
            <span className="rp-label">{t('config.conflict', {revision: runtime.diskRevision})}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
