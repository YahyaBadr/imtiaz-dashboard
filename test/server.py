import http.server, json, csv, io, os, re

DATA_DIR = 'test/data'
def sheet_rows(name):
    p = os.path.join(DATA_DIR, name + '.csv')
    if not os.path.exists(p): return []
    with open(p, encoding='utf-8-sig') as f:
        r = list(csv.reader(f))
    return [r[0]] + r[1:] if r else []

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory='public',**k)
    def do_GET(self):
        m = re.search(r'sheet=([^&]+)', self.path)
        if m:
            name = m.group(1)
            rows = sheet_rows(name)
            body = json.dumps(rows).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin','*')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        if self.path.startswith('/data/'):
            fn = self.path.split('/data/')[-1].split('?')[0]
            p = os.path.join(DATA_DIR, fn)
            if os.path.exists(p):
                data = open(p,'rb').read()
                self.send_response(200); self.send_header('Content-Type','text/csv; charset=utf-8')
                self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
            self.send_error(404); return
        return super().do_GET()
    def log_message(self,*a): pass

http.server.ThreadingHTTPServer(('127.0.0.1',8125),H).serve_forever()
