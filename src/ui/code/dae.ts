import {StreamLanguage} from '@codemirror/language';
import {daeToken, startDaeState, type DaeState} from './daeTokens';

export const dae = StreamLanguage.define<DaeState>({
  name: 'dae',
  languageData: {commentTokens: {line: '#'}, closeBrackets: {brackets: ['(', '{', "'", '"']}},
  startState: startDaeState,
  token: daeToken
});
