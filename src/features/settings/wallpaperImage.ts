// Prepares a chosen image as a Glass wallpaper: the type and size are checked before anything is decoded, then a
// canvas scales the long edge down to 2560px and re-encodes it as WebP, or JPEG where the browser cannot write WebP.
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_EDGE = 2560;
const QUALITY = 0.85;

export type WallpaperProblem = 'type' | 'size' | 'decode';
export class WallpaperError extends Error {
  constructor(readonly problem: WallpaperProblem) {
    super(problem);
  }
}

export function checkFile(file: Pick<File, 'type' | 'size'>): WallpaperProblem | null {
  if (!file.type.startsWith('image/')) return 'type';
  if (file.size > MAX_BYTES) return 'size';
  return null;
}

// The drawn size: the long edge at most `max`, the aspect ratio kept, never scaled up.
export function fitSize(width: number, height: number, max = MAX_EDGE): {width: number; height: number} {
  const scale = Math.min(1, max / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

const encode = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, QUALITY));

export async function prepareWallpaper(file: File): Promise<Blob> {
  const problem = checkFile(file);
  if (problem) throw new WallpaperError(problem);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new WallpaperError('decode');
  }
  const {width, height} = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // A browser that cannot write WebP returns PNG instead; JPEG keeps such a file small.
  const webp = await encode(canvas, 'image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg');
  if (!blob) throw new WallpaperError('decode');
  return blob;
}
