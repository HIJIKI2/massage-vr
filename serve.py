#!/usr/bin/env python3
"""Quest 向けの簡易 HTTPS サーバー。localhost なら python3 -m http.server でも可。"""
import http.server
import json
import os
import socket
import ssl

PORT = 8444
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
os.makedirs('certs', exist_ok=True)
cert, key = 'certs/cert.pem', 'certs/key.pem'
def lan_ips():
    ips = ['127.0.0.1']
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if ip not in ips:
            ips.append(ip)
    except OSError:
        pass
    return ips

if not (os.path.exists(cert) and os.path.exists(key)):
    san = ','.join(['DNS:localhost'] + [f'IP:{ip}' for ip in lan_ips()])
    os.system(
        'openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem '
        f'-days 3650 -subj "/CN=massage-vr" -addext "subjectAltName={san}"'
    )

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/api/vrms':
            folder = os.path.join(ROOT, 'assets', 'VRM')
            files = []
            if os.path.isdir(folder):
                files = sorted(
                    name for name in os.listdir(folder)
                    if name.lower().endswith('.vrm') and os.path.isfile(os.path.join(folder, name))
                )
            body = json.dumps({'dir': 'assets/VRM', 'files': files}, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    extensions_map = {
        **getattr(http.server.SimpleHTTPRequestHandler, 'extensions_map', {}),
        '.js': 'text/javascript',
        '.glb': 'model/gltf-binary',
        '.vrm': 'model/gltf-binary',
    }

httpd = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print(f'https://localhost:{PORT}/')
for ip in lan_ips():
    if ip != '127.0.0.1':
        print(f'https://{ip}:{PORT}/  （Quest 3 は同じ Wi-Fi から。証明書の警告は「詳細」から進む）')
httpd.serve_forever()
