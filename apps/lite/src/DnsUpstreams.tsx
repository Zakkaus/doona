import {useProgressiveRows} from './ui/useProgressiveRows';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {RowMenu as MoreMenu} from './ui/RowMenu';
import {Selector} from '@astryxdesign/core/Selector';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import {useRef, useState, type ReactNode} from 'react';
import {blockFields, isBareName, isQuotable, quote, scanConfig, unquote, type TextField} from '../../../src/dae/text';
import {useMessages} from './i18n';
import {addDraftRule, editDraftRule, ensureBlock, findBlocks, parseRuleList, setFallback} from './ruleDraft';
import {EditDialog} from './ui/EditDialog';
import {pageRhythm} from './ui/PageFrame';
import {usePageCommand, useSearchTarget} from './ui/commands';
import {RowEntrance} from './ui/motion/RowEntrance';
import {revealRow} from './ui/motion/revealRow';

// Protocol spellings from honk-config/src/parser/dns.rs; the API validates the final configuration too.
const schemes = ['udp:', 'tcp:', 'tcp+udp:', 'udp+tcp:', 'tls:', 'https:', 'quic:', 'h3:', 'http3:'];
function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return schemes.includes(url.protocol) && !!url.hostname && (!url.port || (+url.port > 0 && +url.port <= 65535)) && isQuotable(value) && !/\s/.test(value);
  } catch {
    return false;
  }
}
export function DnsUpstreams({
  text,
  change,
  disabled,
  editText,
  loading = false,
  heading,
  renderContent
}: {
  loading?: boolean;
  heading?: ReactNode;
  renderContent?: (content: ReactNode) => ReactNode;
  text: string;
  change: (value: string) => void;
  disabled: boolean;
  editText: () => void;
}) {
  const t = useMessages();
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState('custom');
  const presets = [
    {value: 'alidns', label: t.dnsAli, url: 'https://dns.alidns.com/dns-query'},
    {value: 'dnspod', label: t.dnsPod, url: 'https://doh.pub/dns-query'},
    {value: 'cloudflare', label: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query'},
    {value: 'custom', label: t.dnsCustom, url: ''}
  ];
  const blocks = findBlocks(text, ['dns', 'upstream']);
  const fields = blocks.length === 1 ? blockFields(text, blocks[0], scanConfig(text).tokens) : [];
  const progressive = useProgressiveRows(fields);
  const searchFocus = useRef<string | null>(null);
  const closeEditor = () => {
    setEditing(null);
    const name = searchFocus.current;
    searchFocus.current = null;
    if (name) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-upstream="${CSS.escape(name)}"]`)?.focus());
  };
  const [editing, setEditing] = useState<TextField | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TextField | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const referenced = (field: TextField) =>
    scanConfig(text.slice(0, blocks[0].from) + text.slice(blocks[0].to)).tokens.some(
      token =>
        (token.kind === 'text' || token.kind === 'quoted') &&
        unquote((text.slice(0, blocks[0].from) + text.slice(blocks[0].to)).slice(token.from, token.to)).toLowerCase() === field.name.toLowerCase()
    );
  const original = editing && editing !== 'new' ? editing : undefined;
  const blocked = !!original && name.trim() !== original.name && referenced(original);
  const valid =
    isBareName(name.trim()) &&
    !['asis', 'reject', 'accept'].includes(name.trim().toLowerCase()) &&
    validUrl(url.trim()) &&
    !fields.some(field => field.from !== original?.from && field.name.toLowerCase() === name.trim().toLowerCase());
  const open = (field?: TextField) => {
    setEditing(field ?? 'new');
    setTouched(false);
    setPreset('custom');
    setName(field?.name ?? '');
    setUrl(field ? unquote(field.value) : '');
  };
  usePageCommand('add-upstream', !disabled && blocks.length <= 1, () => open());
  useSearchTarget('upstream', !loading, target => {
    const field = fields.find(field => field.name === target.id);
    if (field && !disabled && validUrl(unquote(field.value))) {
      searchFocus.current = field.name;
      open(field);
    } else if (field && !validUrl(unquote(field.value))) editText();
    else
      requestAnimationFrame(() => {
        const item = document.querySelector<HTMLElement>(`[data-upstream="${CSS.escape(target.id)}"]`);
        item?.scrollIntoView({block: 'center'});
        item?.focus();
      });
  });
  const save = () => {
    if (!valid || blocked) return;
    if (original) {
      const keyTo = scanConfig(text).tokens.find(token => token.from === original.from)!.to;
      let next = text.slice(0, original.valueFrom) + ' ' + quote(url.trim()) + text.slice(original.valueTo);
      if (name.trim() !== original.name) next = next.slice(0, original.from) + name.trim() + next.slice(keyTo);
      change(next);
    } else {
      const next = ensureBlock(text, ['dns', 'upstream']);
      const block = findBlocks(next, ['dns', 'upstream'])[0];
      const line = next.lastIndexOf('\n', block.close - 1) + 1;
      const at = /^[ \t]*$/.test(next.slice(line, block.close)) ? line : block.close;
      change(next.slice(0, at) + `    ${name.trim()}: ${quote(url.trim())}\n` + next.slice(at));
    }
    const savedName = name.trim();
    closeEditor();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => revealRow(root.current?.querySelector<HTMLElement>(`[data-upstream="${CSS.escape(savedName)}"]`) ?? null, !original))
    );
    toast({body: (original ? t.dnsUpdated : t.dnsAdded).replace('{name}', savedName), type: 'info'});
  };
  const content = (
    <>
      {blocks.length > 1 && <Button label={t.listUnavailable} variant="ghost" onClick={editText} />}
      <RowEntrance>
        <VStack gap={pageRhythm.section} data-collection>
          <CollectionLoading loading={loading} name="dns">
            <List hasDividers aria-label={t.upstreams}>
              {loading &&
                !fields.length &&
                Array.from({length: 3}, (_, i) => (
                  <ListItem
                    key={`loading-${i}`}
                    data-skeleton-row
                    label={<RowPlaceholder />}
                    description={<RowPlaceholder supporting />}
                    endContent={<Skeleton className="lite-loading-shape lite-loading-icon" />}
                  />
                ))}
              {progressive.map(field => (
                <ListItem
                  key={field.name}
                  data-upstream={field.name}
                  tabIndex={-1}
                  label={
                    <Link
                      {...loadingControl(loading, 'children', field.name)}
                      color="primary"
                      weight="medium"
                      isDisabled={disabled}
                      onClick={() => (validUrl(unquote(field.value)) ? open(field) : editText())}
                    />
                  }
                  description={
                    <LoadingText loading={loading} type="supporting" color="secondary" textWrap="wrap" style={{overflowWrap: 'anywhere'}}>
                      {unquote(field.value)}
                    </LoadingText>
                  }
                  endContent={
                    <MoreMenu
                      {...loadingControl(loading, 'icon')}
                      label={t.actionFor.replace('{name}', field.name)}
                      size="sm"
                      variant="ghost"
                      isDisabled={disabled}
                      items={[
                        {
                          label: t.dnsUseChina,
                          isDisabled: parseRuleList(text, 'request').ambiguous,
                          onClick: () => {
                            const existing = parseRuleList(text, 'request').rows.find(
                              row =>
                                row.conditions?.length === 1 &&
                                row.conditions[0].kind === 'qnameGeosite' &&
                                !row.conditions[0].negate &&
                                row.conditions[0].value === 'cn'
                            );
                            const next = existing
                              ? editDraftRule(text, existing, existing.conditions!, field.name)
                              : addDraftRule(text, 'request', 'qname(geosite: cn)', field.name);
                            change(next);
                            const index = parseRuleList(next, 'request').rows.findIndex(
                              row =>
                                row.conditions?.length === 1 &&
                                row.conditions[0].kind === 'qnameGeosite' &&
                                !row.conditions[0].negate &&
                                row.conditions[0].value === 'cn'
                            );
                            requestAnimationFrame(() => revealRow(document.querySelector(`[data-rule-list="request"] [data-rule-index="${index}"]`)));
                            toast({body: t.dnsChinaSet.replace('{name}', field.name), type: 'info'});
                          }
                        },
                        {
                          label: t.dnsUseDefault,
                          isDisabled: parseRuleList(text, 'request').ambiguous,
                          onClick: () => {
                            change(setFallback(text, 'request', field.name));
                            requestAnimationFrame(() => revealRow(document.querySelector('[data-rule-list="request"] [data-fallback]')));
                            toast({body: t.dnsDefaultSet.replace('{name}', field.name), type: 'info'});
                          }
                        },
                        {
                          label: validUrl(unquote(field.value)) ? t.edit : t.editAsText,
                          onClick: () => (validUrl(unquote(field.value)) ? open(field) : editText())
                        },
                        {label: t.delete, onClick: () => setDeleting(field)}
                      ]}
                    />
                  }
                />
              ))}
            </List>
          </CollectionLoading>
          {!fields.length && <Text color="secondary">{t.noUpstreams}</Text>}
        </VStack>
      </RowEntrance>
    </>
  );
  return (
    <VStack gap={pageRhythm.toolbarToCollection} ref={root}>
      {heading}
      {renderContent ? renderContent(content) : content}
      <EditDialog
        open={editing !== null}
        reset={original ? () => open(original) : undefined}
        title={original ? t.editUpstream : t.addUpstream}
        close={closeEditor}
        pending={false}
        label={original ? t.save : t.add}
        disabled={!valid || blocked}
        disabledReason={blocked ? t.upstreamReferenced : !touched || !name.trim() || !url.trim() ? t.enterDnsDetails : t.invalidUpstream}
        confirm={save}
      >
        {!original && (
          <Selector
            label={t.dnsPreset}
            value={preset}
            options={presets}
            width="100%"
            onChange={value => {
              setPreset(value);
              const selected = presets.find(item => item.value === value)!;
              let candidate = value;
              for (let i = 2; fields.some(field => field.name.toLowerCase() === candidate.toLowerCase()); i++) candidate = `${value}${i}`;
              setName(value === 'custom' ? '' : candidate);
              setUrl(selected.url);
            }}
          />
        )}
        <TextInput label={t.name} value={name} onChange={setName} onBlur={() => setTouched(true)} />
        <TextInput
          label={t.upstreamUrl}
          onBlur={() => setTouched(true)}
          value={url}
          onChange={setUrl}
          placeholder={t.dnsUrlPlaceholder}
          description={t.dnsSchemes}
        />
        {blocked ? <Text color="secondary">{t.upstreamReferenced}</Text> : touched && !valid ? <Text color="secondary">{t.invalidUpstream}</Text> : null}
      </EditDialog>
      <EditDialog
        open={!!deleting}
        title={t.deleteUpstream}
        close={() => setDeleting(null)}
        pending={false}
        label={t.delete}
        destructive
        disabled={!!deleting && referenced(deleting)}
        disabledReason={t.upstreamReferenced}
        confirm={() => {
          if (deleting && !referenced(deleting)) {
            change(text.slice(0, deleting.from) + text.slice(deleting.to));
            setDeleting(null);
          }
        }}
      >
        <Text>{deleting?.name}</Text>
        <Text>{deleting && referenced(deleting) ? t.upstreamReferenced : t.leaveDraftHelp}</Text>
      </EditDialog>
    </VStack>
  );
}
