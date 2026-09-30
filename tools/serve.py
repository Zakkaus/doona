#!/usr/bin/env python3
"""Static server for local builds, with caching disabled and an optional URL prefix."""
import argparse
import functools
import io
import posixpath
import re
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

WORKER_BUILD = rb"(?<=const BUILD = ')[^']+(?=')"
BUILD_REPLY = rb'\n  if \(event\.data\?\.build === true\) \{.*?\n  \}'
PAGE_BUILD = rb'(?<=<meta name="doona-build" content=")[^"]+(?=")'

class NoCache(SimpleHTTPRequestHandler):
    def __init__(self, *args, prefix='', worker_update=False, **kwargs):
        self.prefix = prefix
        self.worker_update = worker_update
        super().__init__(*args, **kwargs)

    def send_head(self):
        requested = unquote(urlsplit(self.path).path)
        path = posixpath.normpath(requested)
        if self.prefix and path != self.prefix and not path.startswith(self.prefix + '/'):
            self.send_error(404)
            return None
        # A cookie makes the worker, or the page, stand for an older build than the files on disk: a legacy worker is one
        # from before workers reported their build.
        if self.worker_update and path == self.prefix + '/sw.js':
            if self.cookie('doona-pwa-legacy'):
                return self.rewritten('sw.js', 'text/javascript', (WORKER_BUILD, b'legacy'), (BUILD_REPLY, b''))
            if self.cookie('doona-pwa-update'):
                return self.rewritten('sw.js', 'text/javascript', (WORKER_BUILD, b'update'))
        if self.worker_update and requested in (self.prefix + '/', self.prefix + '/index.html') and self.cookie('doona-pwa-page'):
            return self.rewritten('index.html', 'text/html; charset=utf-8', (PAGE_BUILD, b'update'))
        return super().send_head()

    def cookie(self, name):
        morsel = SimpleCookie(self.headers.get('Cookie', '')).get(name)
        return morsel is not None and morsel.value == '1'

    def rewritten(self, name, content_type, *edits):
        updated = (Path(self.directory) / name).read_bytes()
        for pattern, replacement in edits:
            updated, count = re.subn(pattern, replacement, updated, flags=re.S)
            if count != 1:
                self.send_error(500, f'{pattern!r} not found in {name}')
                return None
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(updated)))
        self.end_headers()
        return io.BytesIO(updated)

    def translate_path(self, path):
        if self.prefix:
            path = path[len(self.prefix):] or '/'
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *args):
        pass

class Server(ThreadingHTTPServer):
    # A service worker install fetches the whole shell at once. With the default backlog of 5, a busy machine drops
    # connection attempts, and the browser retries each one after a growing delay, so the install can stall for many
    # seconds.
    request_queue_size = 128

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port', nargs='?', type=int, default=4173)
    parser.add_argument('directory', nargs='?', default='.')
    parser.add_argument('--prefix', default='')
    parser.add_argument('--worker-update', action='store_true')
    args = parser.parse_args()
    prefix = args.prefix.rstrip('/')
    if prefix and (not prefix.startswith('/') or posixpath.normpath(prefix) != prefix or any(c in prefix for c in '?#%')):
        parser.error('--prefix must be an absolute URL path, such as /ui')
    handler = functools.partial(NoCache, directory=args.directory, prefix=prefix, worker_update=args.worker_update)
    Server(('0.0.0.0', args.port), handler).serve_forever()
