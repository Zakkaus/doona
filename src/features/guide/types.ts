import type {GuideSection, GuideSubsection} from '../shared/guide';

// Text in a block may mark code with backticks; nothing else is interpreted.
export type GuideBlock =
  | {kind: 'p'; text: string}
  | {kind: 'h'; text: string; id?: GuideSubsection}
  | {kind: 'list'; ordered?: true; items: string[]}
  | {kind: 'code'; lang: 'dae' | 'sh' | 'ini' | 'text'; text: string}
  | {kind: 'table'; head: string[]; rows: string[][]}
  | {kind: 'links'; items: Array<{href: string; text: string}>};
export type GuideContent = {
  interimTitle: string;
  interim: string;
  sections: Array<{id: GuideSection; title: string; blocks: GuideBlock[]}>;
};
