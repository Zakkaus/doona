import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {Button as RButton, TooltipTrigger} from 'react-aria-components';
import {formatList, useLang} from '../i18n';
import {Link} from './Link';
import {Tip} from './Tooltip';
import {cx} from './cx';

// One item of a set, as S2's Tag: a label with an optional trailing action (remove, undo). Built on plain markup
// rather than a react-aria TagGroup so a page that shows a few tags does not pull a collection into the shell.
export function Tag({children, tone, action}: {children: ReactNode; tone?: 'new' | 'removed'; action?: ReactNode}) {
  return (
    <span className={cx('rp-tag', tone)}>
      <span className="rp-tag-label">{children}</span>
      {action}
    </span>
  );
}

export function Tags({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="rp-tags" role="group" aria-label={label}>
      {children}
    </div>
  );
}

// A linked tag has one hit target and one keyboard stop across its whole surface.
export function LinkTag({href, children}: {href: string; children: ReactNode}) {
  return (
    <Link href={href} className="rp-tag rp-tag-link">
      <span className="rp-tag-label">{children}</span>
    </Link>
  );
}

// How many tags of these widths fit one line of `width`: all of them, or as many whole ones as leave room for the
// overflow tag that counts the rest, `more(hidden)` wide.
export function fitTags(widths: readonly number[], more: (hidden: number) => number, width: number, gap: number): number {
  const fits = (used: number) => used <= width + 0.01;
  const ends = widths.reduce<number[]>((sums, tag) => [...sums, sums[sums.length - 1] + tag + gap], [0]);
  if (fits(ends[widths.length] - gap)) return widths.length;
  let count = widths.length - 1;
  while (count > 0 && !fits(ends[count] + more(widths.length - count))) count--;
  return count;
}

// The overflow tag of S2's TagGroup: "+N" for the hidden tags, naming them all on hover, keyboard focus or a tap; a
// second tap closes the tip. Its press only drives the tip, so it never presses the row around it.
function MoreTag({count, label, names}: {count: number; label: string; names: string}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipTrigger delay={400} isOpen={open} onOpenChange={setOpen} shouldCloseOnPress={false}>
      <RButton className="rp-tag rp-tag-more" aria-label={label} onPress={event => setOpen(shown => (event.pointerType === 'touch' ? !shown : true))}>
        <span className="rp-tag-label">+{count}</span>
      </RButton>
      <Tip>{names}</Tip>
    </TooltipTrigger>
  );
}

type Sizes = {key: string; tags: number[]; more: number[]; gap: number};
// The overflow tag's width for a count, read from one tag per digit count; its digits are tabular.
const moreWidth = (sizes: Sizes) => (hidden: number) => sizes.more[String(hidden).length - 1];

// Every FitTags box shares one observer. A column resize reports every row at once: all boxes are read first and
// all refits then commit in one synchronous render, before the browser paints. A font that arrives measures every
// box again, hidden tags included.
type Fitter = {read: () => (() => void) | null; remeasure: () => void};
const fitters = new Map<Element, Fitter>();
let shared: ResizeObserver | null = null;
function apply(updates: Array<(() => void) | null>) {
  const pending = updates.filter(update => update !== null);
  if (pending.length) flushSync(() => pending.forEach(update => update()));
}
function sharedObserver() {
  if (!shared) {
    shared = new ResizeObserver(entries => {
      const boxes = new Set(entries.map(entry => entry.target.closest('.rp-tags[data-fit]')));
      apply([...boxes].map(box => (box && fitters.get(box)?.read()) ?? null));
    });
    document.fonts?.addEventListener('loadingdone', () => apply([...fitters.values()].map(fitter => fitter.remeasure)));
  }
  return shared;
}

// Linked tags on one line, as S2's TagGroup does with a row limit: as many whole tags as the width holds, then a
// "+N" tag for the rest; no tag is cut and nothing scrolls. Widths are read with every tag and overflow tag laid
// out, once per set and language, again when a font arrives or a tag changes width, and each resize refits from them.
export function FitTags({
  label,
  items,
  more
}: {
  label: string;
  items: ReadonlyArray<{id: string; label: string; href: string}>;
  more: (count: number) => string;
}) {
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const sizes = useRef<Sizes | null>(null);
  const watched = useRef(new Set<Element>());
  const key = `${lang}\n${items.map(item => item.label).join('\n')}`;
  // A null count lays out every tag to be measured; a new object asks for a fresh measure.
  const [fit, setFit] = useState<{key: string; count: number | null}>({key, count: null});
  const count = fit.key === key ? fit.count : null;
  useLayoutEffect(() => {
    const el = ref.current;
    // A hidden element (a kept-mounted tab panel) measures zero; it is measured once it shows.
    if (count !== null || !el?.getClientRects().length) return;
    const widths = [...el.children].map(child => child.getBoundingClientRect().width);
    const known = {key, tags: widths.slice(0, items.length), more: widths.slice(items.length), gap: Number.parseFloat(getComputedStyle(el).columnGap) || 0};
    sizes.current = known;
    setFit({key, count: fitTags(known.tags, moreWidth(known), el.getBoundingClientRect().width, known.gap)});
  }, [fit, key, count, items.length]);
  // The box and the tags on show are watched, so a resize refits and a changed tag width measures again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const remeasure = () => setFit({key, count: null});
    fitters.set(el, {
      remeasure,
      read: () => {
        const known = sizes.current;
        if (!el.getClientRects().length) return null;
        const tags = [...el.children].filter(child => !child.classList.contains('rp-tag-more'));
        if (known?.key !== key || tags.some((tag, i) => Math.abs(tag.getBoundingClientRect().width - known.tags[i]) > 0.5)) return remeasure;
        const next = fitTags(known.tags, moreWidth(known), el.getBoundingClientRect().width, known.gap);
        return next === count ? null : () => setFit({key, count: next});
      }
    });
    const observer = sharedObserver();
    const nodes = new Set([el, ...el.children]);
    for (const node of watched.current) if (!nodes.has(node)) observer.unobserve(node);
    for (const node of nodes) if (!watched.current.has(node)) observer.observe(node);
    watched.current = nodes;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    const nodes = watched;
    return () => {
      if (el) fitters.delete(el);
      for (const node of nodes.current) shared?.unobserve(node);
      nodes.current = new Set();
    };
  }, []);
  const names = formatList(
    lang,
    items.map(item => item.label)
  );
  const hidden = count === null ? 0 : items.length - count;
  // While measuring, one overflow tag per digit count stands beside every tag.
  const probes = count === null && items.length ? Array.from({length: String(items.length).length}, (_, i) => 10 ** (i + 1) - 1) : [];
  return (
    <div ref={ref} className="rp-tags" role="group" aria-label={label} data-fit="">
      {items.slice(0, count ?? items.length).map(item => (
        <LinkTag key={item.id} href={item.href}>
          {item.label}
        </LinkTag>
      ))}
      {probes.map(n => (
        <MoreTag key={n} count={n} label={more(n)} names={names} />
      ))}
      {hidden > 0 && <MoreTag count={hidden} label={more(hidden)} names={names} />}
    </div>
  );
}
