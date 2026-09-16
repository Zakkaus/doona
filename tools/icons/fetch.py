#!/usr/bin/env python3
"""Fetch every icon named in src/ui/brands.json and store it as a 64px PNG under public/brands/<id>.png.

Sources are the community packs listed in packs.json, fetched through jsDelivr, or "favicon/<host>" for a
site's own icon (Google's favicon service first, DuckDuckGo's as the fallback; anything under 48px is
rejected as too blurry). Downloads are cached so a re-run after editing the catalogue only touches new
entries. Run from anywhere.
"""
import io
import json
import os
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SIZE = 64
CACHE = Path(os.environ.get('DOONA_ICON_CACHE', '/scratch/ssd/doona-tools/icons/cache'))


MIN_FAVICON = 48


def fetch(url: str, cache: Path) -> bytes:
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['curl', '-sSfL', '--max-time', '30', '-o', str(cache), url], check=True)
    return cache.read_bytes()


def favicon(host: str, cache: Path) -> Image.Image:
    """The largest usable icon a favicon service has for the host."""
    candidates = [
        f'https://www.google.com/s2/favicons?domain={host}&sz=128',
        f'https://icons.duckduckgo.com/ip3/{host}.ico'
    ]
    best = None
    for index, url in enumerate(candidates):
        try:
            image = Image.open(io.BytesIO(fetch(url, cache.with_suffix(f'.{index}')))).convert('RGBA')
        except Exception:  # noqa: BLE001 - try the next service
            continue
        if best is None or image.width > best.width:
            best = image
        if best.width >= 128:
            break
    if best is None or best.width < MIN_FAVICON:
        raise ValueError(f'no favicon of at least {MIN_FAVICON}px for {host}')
    return best


def main() -> int:
    packs = json.loads((HERE / 'packs.json').read_text())
    brands = json.loads((ROOT / 'src/ui/brands.json').read_text())
    out = ROOT / 'public/brands'
    out.mkdir(parents=True, exist_ok=True)
    wanted = {f"{brand['id']}.png" for brand in brands}
    failed = []

    def one(brand: dict) -> None:
        pack, _, name = brand['source'].partition('/')
        target = out / f"{brand['id']}.png"
        if target.exists() and not os.environ.get('DOONA_ICON_FORCE'):
            return
        try:
            if pack == 'favicon':
                url = name
                image = favicon(name, CACHE / pack / name)
            else:
                repo, folder = packs[pack]['repo'], packs[pack]['dir']
                url = f"https://cdn.jsdelivr.net/gh/{repo}@master/{folder}/{urllib.parse.quote(name)}.png"
                image = Image.open(io.BytesIO(fetch(url, CACHE / pack / f'{name}.png'))).convert('RGBA')
            image.thumbnail((SIZE, SIZE), Image.LANCZOS)
            canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
            canvas.paste(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2))
            canvas.save(target, optimize=True)
            print('ok', brand['id'], '<-', brand['source'], flush=True)
        except Exception as error:  # noqa: BLE001 - report and keep going
            failed.append((brand['id'], url, error))

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(one, brands))
    for stale in out.glob('*.png'):
        if stale.name not in wanted:
            stale.unlink()
            print('removed', stale.name)
    for brand_id, url, error in failed:
        print('FAILED', brand_id, url, error, file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
