import {describe, expect, it} from 'vitest';
import {MAX_BYTES, MAX_EDGE, WallpaperError, checkFile, fitSize, prepareWallpaper} from './wallpaperImage';

describe('wallpaper image', () => {
  it.each([
    ['a PNG', {type: 'image/png', size: 1000}, null],
    ['an image of exactly 20 MB', {type: 'image/jpeg', size: MAX_BYTES}, null],
    ['an image over 20 MB', {type: 'image/jpeg', size: MAX_BYTES + 1}, 'size'],
    ['a text file', {type: 'text/plain', size: 10}, 'type'],
    ['a file without a type', {type: '', size: 10}, 'type']
  ])('checks %s before decoding', (_, file, problem) => {
    expect(checkFile(file)).toBe(problem);
  });

  it.each([
    [4000, 3000, {width: MAX_EDGE, height: 1920}],
    [1200, 6000, {width: 512, height: MAX_EDGE}],
    [1920, 1080, {width: 1920, height: 1080}],
    [MAX_EDGE, MAX_EDGE, {width: MAX_EDGE, height: MAX_EDGE}]
  ])('caps %ix%i at a 2560px long edge without scaling up', (width, height, size) => {
    expect(fitSize(width, height)).toEqual(size);
  });

  it('rejects a non-image and an oversized file without decoding them', async () => {
    await expect(prepareWallpaper(new File(['x'], 'a.txt', {type: 'text/plain'}))).rejects.toEqual(new WallpaperError('type'));
    const big = new File([new Uint8Array(MAX_BYTES + 1)], 'a.png', {type: 'image/png'});
    await expect(prepareWallpaper(big)).rejects.toMatchObject({problem: 'size'});
  });
});
