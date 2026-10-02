import {dnsMatcher} from './match';

self.onmessage = (event: MessageEvent<{text: string; names: string[]}>) => {
  const matcher = dnsMatcher('regex', event.data.text);
  self.postMessage(matcher ? event.data.names.flatMap((name, index) => (matcher(name) ? [index] : [])) : null);
};
self.postMessage('ready');
