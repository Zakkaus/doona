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

class NoCache(SimpleHTTPRequestHandler):
    def __init__(self, *args, prefix='', worker_update=False, **kwargs):
        self.prefix = prefix
        self.worker_update = worker_update
        super().__init__(*args, **kwargs)

    def send_head(self):
        path = posixpath.normpath(unquote(urlsplit(self.path).path))
        if self.prefix and path != self.prefix and not path.startswith(self.prefix + '/'):
            self.send_error(404)
            return None
        if self.worker_update and path == self.prefix + '/sw.js':
            update = SimpleCookie(self.headers.get('Cookie', '')).get('doona-pwa-update')
            if update and update.value == '1':
                original = (Path(self.directory) / 'sw.js').read_bytes()
                updated, count = re.subn(rb"(const CACHE = PREFIX \+ ')[^']+'", rb"\g<1>update'", original)
                if count != 1:
                    self.send_error(500, 'worker cache key not found')
                    return None
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript')
                self.send_header('Content-Length', str(len(updated)))
                self.end_headers()
                return io.BytesIO(updated)
        return super().send_head()

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
    ThreadingHTTPServer(('0.0.0.0', args.port), handler).serve_forever()
