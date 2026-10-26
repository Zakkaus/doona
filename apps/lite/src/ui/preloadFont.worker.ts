export {};

self.onmessage = (event: MessageEvent<{fonts: string[]; text: string}>) => {
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  if (context) {
    for (const font of event.data.fonts) {
      context.font = font;
      context.measureText(event.data.text);
    }
  }
  self.postMessage(null);
};
