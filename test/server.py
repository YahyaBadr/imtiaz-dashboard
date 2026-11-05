import http.server
import json
import csv
import os
import re
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public'))
DATA_DIR = os.path.join(ROOT, 'data')
PORT = int(os.environ.get('E2E_PORT', '8125'))


def sheet_rows(name):
    """Return a CSV sheet as a list of dicts (emulates the Apps Script JSON API)."""
    name = os.path.basename(urllib.parse.unquote(name))
    p = os.path.join(DATA_DIR, name + '.csv')
    if not os.path.exists(p):
        return []
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        m = re.search(r'[?&]sheet=([^&]+)', self.path)
        if m:
            rows = sheet_rows(m.group(1))
            body = json.dumps(rows, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'Static test server: http://127.0.0.1:{PORT}/ (root={ROOT})')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
