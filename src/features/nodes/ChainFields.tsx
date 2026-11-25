import {useT} from '../../i18n';
import {Button, TextField} from '../../ui/ui';
import {SearchSelect, type SearchItem} from '../../ui/SearchSelect';
import ChevronDown from '../../ui/icons/ChevronDown';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';

const chainHopLimits = {min: 2, max: 4};

// A proxy chain's name and its hops from entry to exit; the controller checks them and writes the chain.
export function ChainFields({
  name,
  nameError,
  hops,
  hopErrors,
  choices,
  isDisabled,
  onName,
  onHops
}: {
  name: string;
  nameError?: string;
  hops: string[];
  hopErrors: Array<string | null>;
  choices: SearchItem[];
  isDisabled?: boolean;
  onName: (name: string) => void;
  onHops: (hops: string[]) => void;
}) {
  const t = useT();
  const move = (from: number, to: number) => {
    const next = [...hops];
    [next[from], next[to]] = [next[to], next[from]];
    onHops(next);
  };
  const without = (index: number) => hops.filter((_, i) => i !== index);
  const fewest = hops.length <= chainHopLimits.min;
  return (
    <>
      <span className="rp-label">{t('nodes.proxyChain.help')}</span>
      <TextField error={nameError} isDisabled={isDisabled} label={t('ui.name')} value={name} onChange={onName} />
      {hops.map((hop, index) => {
        const n = index + 1;
        const last = index === hops.length - 1;
        return (
          <SearchSelect
            key={index}
            label={t('nodes.proxyChain.hop', {n})}
            searchLabel={t('nodes.search')}
            placeholder={t('nodes.proxyChain.pickHop')}
            sections={[{id: 'nodes', items: choices}]}
            value={hop}
            error={hopErrors[index]}
            isDisabled={isDisabled}
            onChange={value => onHops(hops.map((other, i) => (i === index ? value : other)))}
            action={
              <>
                <Button quiet icon label={t('nodes.proxyChain.moveUp', {n})} isDisabled={isDisabled || index === 0} onPress={() => move(index, index - 1)}>
                  <ChevronDown className="rp-up" />
                </Button>
                <Button quiet icon label={t('nodes.proxyChain.moveDown', {n})} isDisabled={isDisabled || last} onPress={() => move(index, index + 1)}>
                  <ChevronDown />
                </Button>
                <Button quiet icon label={t('nodes.proxyChain.removeHop', {n})} isDisabled={isDisabled || fewest} onPress={() => onHops(without(index))}>
                  <Close />
                </Button>
              </>
            }
          />
        );
      })}
      <span className="rp-cluster">
        <Button secondary isDisabled={isDisabled || hops.length >= chainHopLimits.max} onPress={() => onHops([...hops, ''])}>
          <AddCircle />
          {t('nodes.proxyChain.addHop')}
        </Button>
      </span>
    </>
  );
}
