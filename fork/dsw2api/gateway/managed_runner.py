"""Fork-owned loopback gateway lifecycle and private account configuration.

Only the normal inference API is exposed with its client key. Management uses
a different key and never returns the account token or cookies.
"""
import argparse
import asyncio
import base64
import ctypes
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import secrets
import socket
import sys
import threading
import time
import uuid
from urllib.parse import parse_qs

ROOT = Path(__file__).resolve().parent.parent


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value), encoding='utf8')
        os.replace(temporary, path)
    finally:
        if temporary.exists(): temporary.unlink()


def dpapi(data, encrypt):
    if os.name != 'nt': raise RuntimeError('This managed gateway requires Windows')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    function = crypt.CryptProtectData if encrypt else crypt.CryptUnprotectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise RuntimeError('Windows credential protection failed')
    try: return ctypes.string_at(output.data, output.size)
    finally: kernel.LocalFree(output.data)


def load_keys(directory, create=False):
    path = directory / 'keys.dpapi'
    if path.is_symlink() or path.is_junction(): raise RuntimeError('Credential path must not be a link')
    if path.exists():
        value = json.loads(dpapi(path.read_bytes(), False))
        if not all(isinstance(value.get(key), str) and len(value[key]) >= 32 for key in ('client', 'control', 'encryption')):
            raise RuntimeError('Credential material is invalid')
        return value
    if not create: return None
    if (directory / 'accounts.json').exists():
        raise RuntimeError('Existing account protection material is missing; restore it before starting')
    value = {'client': secrets.token_urlsafe(32), 'control': secrets.token_urlsafe(32),
             'encryption': base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('ascii')}
    temporary = path.with_name('keys.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_bytes(dpapi(json.dumps(value).encode('utf8'), True))
        os.replace(temporary, path)
    finally:
        if temporary.exists(): temporary.unlink()
    return value


def manifest():
    return json.loads((ROOT / 'manifest.json').read_text(encoding='utf8'))


def identity_mac(key, nonce, record):
    message = '\n'.join((nonce, str(record['pid']), record['build_id'], record['instance_id']))
    return hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()


def configure_environment(directory, keys):
    # Do not import another application's dotenv files, account stores or keys.
    values = {
        'ACCOUNT_STORE_PATH': str(directory / 'accounts.json'),
        'API_KEY_STORE_PATH': str(directory / 'api-keys.sqlite3'),
        'DEEPSEEK_ENCRYPTION_KEY': keys['encryption'],
        'API_KEYS': keys['client'], 'DEEPSEEK_API_KEY': '',
        'DEEPSEEK_ADMIN_PASSWORD': keys['control'],
        'ALLOW_UNAUTHENTICATED_API': 'false', 'ALLOW_INSECURE_PUBLIC_DEFAULTS': 'false',
        'ALLOWED_ORIGINS': '', 'ALLOW_CORS_CREDENTIALS': 'false',
        'ENABLE_RATE_LIMIT': 'false', 'CLIENT_RPM_PER_KEY': '0', 'CLIENT_RPM_PER_IP': '0',
        'MODEL_NAME': 'deepseek-web', 'MODEL_ROUTES': '', 'THINKING': 'auto', 'SEARCH': 'auto',
        'MODE': 'auto', 'HOST': '127.0.0.1', 'PORT': '0',
        'DEEPSEEK_RATE_LIMIT_RETRY_DELAYS': '', 'DEEPSEEK_JITTER_SECS': '0',
        # This managed service stores one personal account. Queue the next
        # turn until SSE teardown releases it; never expose a local busy-503
        # after delivering a tool call. This is serialization, not a quota.
        'DEEPSEEK_MAX_CONCURRENCY': '1',
        'DISABLE_AUTO_RECOVER': '1', 'LOG_LEVEL': 'WARNING',
        'CLINE_DSW_POW_HELPER': str(ROOT / 'cline-dsw2api-pow.exe'),
    }
    os.environ.update(values)
    os.chdir(directory)


class ManagedApp:
    def __init__(self, upstream, directory, keys, record):
        self.upstream, self.directory, self.keys, self.record = upstream, directory, keys, record
        self.active = 0
        self.updating = False
        self.server = None

    async def respond(self, send, status, body):
        from starlette.responses import JSONResponse
        await JSONResponse(body, status_code=status)({'type': 'http'}, None, send)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.upstream.app(scope, receive, send)
        path = scope.get('path', '')
        headers = {key.lower(): value for key, value in scope['headers']}
        if path == '/health' and scope['method'] == 'GET':
            nonce = parse_qs(scope.get('query_string', b'').decode('ascii', errors='ignore')).get('nonce', [''])[0]
            if len(nonce) > 128: return await self.respond(send, 400, {'error': 'Invalid health nonce'})
            result = dict(self.record)
            result['nonce_mac'] = identity_mac(self.keys['control'], nonce, self.record)
            result['client_nonce_mac'] = identity_mac(self.keys['client'], nonce, self.record)
            return await self.respond(send, 200, result)
        management = path.startswith('/control/')
        if not management and path not in ('/v1/models', '/v1/chat/completions'):
            return await self.respond(send, 404, {'error': 'Not found'})
        supplied = headers.get(b'authorization', b'').decode('utf8', errors='replace')
        expected = 'Bearer ' + self.keys['control' if management else 'client']
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            return await self.respond(send, 401, {'error': 'Authentication required'})
        if self.updating and not management:
            return await self.respond(send, 409, {'error': 'DeepSeek session update is in progress'})
        messages = []
        length = 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect': return
            length += len(message.get('body', b''))
            if length > (131072 if management else 41943040):
                return await self.respond(send, 413, {'error': 'Request body exceeds the safe memory bound'})
            messages.append(message)
            if not message.get('more_body', False): break
        cancelled = threading.Event()
        disconnected = asyncio.Event()
        async def monitor():
            while True:
                event = await receive()
                if event['type'] == 'http.disconnect':
                    cancelled.set(); disconnected.set(); return
        async def replay():
            if messages: return messages.pop(0)
            await disconnected.wait()
            return {'type': 'http.disconnect'}
        async def forward(message):
            try: await send(message)
            except BaseException:
                cancelled.set(); raise
        from managed_transport import REQUEST_CANCEL
        context = REQUEST_CANCEL.set(cancelled)
        watcher = asyncio.create_task(monitor())
        if not management: self.active += 1
        try:
            if management:
                from starlette.requests import Request
                return await self.control(path, Request(scope, replay), send)
            await self.upstream.app(scope, replay, forward)
        finally:
            if not management: self.active -= 1
            cancelled.set(); watcher.cancel()
            try: await watcher
            except asyncio.CancelledError: pass
            REQUEST_CANCEL.reset(context)

    async def control(self, path, request, send):
        from admin import get_pool
        pool = get_pool()
        if path == '/control/status' and request.method == 'GET':
            return await self.respond(send, 200, {'configured': pool.count() > 0, 'account_count': pool.count(),
                'active_requests': self.active, 'model_id': 'deepseek-web', 'thinking_control': 'on/off',
                'local_request_quota': None, 'local_output_cap': None})
        if path == '/control/registration' and request.method == 'POST':
            atomic_json(self.directory / 'provider-registration.json', {'component': 'cline-dsw2api', 'provider_id': 'dsw2api'})
            return await self.respond(send, 200, {'registered': True})
        if path == '/control/shutdown' and request.method == 'POST':
            if self.active: return await self.respond(send, 409, {'error': 'DeepSeek requests are still active'})
            self.server.should_exit = True
            return await self.respond(send, 200, {'stopping': True})
        if path != '/control/session' or request.method != 'POST':
            return await self.respond(send, 404, {'error': 'Not found'})
        if self.active or self.updating:
            return await self.respond(send, 409, {'error': 'Wait for active DeepSeek requests before changing the session'})
        try: data = await request.json()
        except (ValueError, UnicodeError):
            return await self.respond(send, 400, {'error': 'A DeepSeek session object is required'})
        if not isinstance(data, dict):
            return await self.respond(send, 400, {'error': 'A DeepSeek session object is required'})
        token, cookies = data.get('token'), data.get('cookies', '')
        if not isinstance(token, str) or not token.strip() or not isinstance(cookies, str):
            return await self.respond(send, 400, {'error': 'A personal DeepSeek session token is required'})
        if len(token) > 16384 or len(cookies) > 65536:
            return await self.respond(send, 400, {'error': 'Invalid DeepSeek session length'})
        self.updating = True
        try:
            from adapter import DeepSeekAdapter, BASE_URL
            from starlette.concurrency import run_in_threadpool
            token = DeepSeekAdapter._normalize_token(token)
            def verify():
                adapter = DeepSeekAdapter(token=token, cookies=cookies)
                try:
                    response = adapter._client.get(BASE_URL + '/api/v0/users/current', headers=adapter._base_headers, timeout=15)
                    value = response.json()
                    if response.status_code != 200 or value.get('code') != 0 or value.get('data', {}).get('biz_code', 0) != 0 or not value.get('data', {}).get('biz_data'):
                        raise ValueError('Session verification failed')
                finally: adapter._client.close()
            try: await run_in_threadpool(verify)
            except Exception:
                return await self.respond(send, 401, {'error': 'DeepSeek session could not be verified; sign in and copy the current session'})
            accounts = pool.get_all()
            if accounts:
                pool.update(accounts[0]['id'], token=token, cookies=cookies, email='DeepSeek')
            else:
                pool.add(token=token, cookies=cookies, email='DeepSeek')
            return await self.respond(send, 200, {'configured': True, 'model_id': 'deepseek-web'})
        finally:
            self.updating = False


async def serve(directory):
    import msvcrt
    lock = (directory / 'service.lock').open('a+b')
    lock.seek(0)
    try: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        lock.close(); raise RuntimeError('A gateway already owns this data directory')
    keys = load_keys(directory, create=True)
    configure_environment(directory, keys)
    import server as upstream
    import uvicorn
    # The original logger uses stdout. Readiness is a separate, non-secret IPC line.
    for logger in (logging.getLogger(), logging.getLogger('ds2api')):
        for handler in logger.handlers:
            if isinstance(handler, logging.StreamHandler): handler.setStream(sys.stderr)
    build = manifest()['build_id']
    instance = uuid.uuid4().hex
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    preferred = 0
    record_path = directory / 'service.json'
    if record_path.exists():
        try:
            previous = json.loads(record_path.read_text(encoding='utf8'))
            candidate = int(previous.get('port', 0))
            preferred = candidate if 1024 <= candidate <= 65535 else 0
        except (ValueError, OSError): pass
    try: listener.bind(('127.0.0.1', preferred))
    except OSError: listener.bind(('127.0.0.1', 0))
    listener.listen(128); listener.setblocking(False)
    port = listener.getsockname()[1]
    record = {'pid': os.getpid(), 'port': port, 'build_id': build, 'instance_id': instance, 'fixture': False}
    app = ManagedApp(upstream, directory, keys, record)
    class ReadyServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            if self.started:
                atomic_json(record_path, record)
                print(json.dumps({'type': 'ready', **record}), flush=True)
    server = ReadyServer(uvicorn.Config(app, host='127.0.0.1', port=port, access_log=False, log_level='warning'))
    app.server = server
    try: await server.serve(sockets=[listener])
    finally:
        if record_path.exists():
            try:
                if json.loads(record_path.read_text(encoding='utf8')).get('instance_id') == instance: record_path.unlink()
            except OSError: pass
        lock.close(); listener.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('serve', 'describe'))
    parser.add_argument('--state-dir', required=True)
    parser.add_argument('--internal', action='store_true')
    arguments = parser.parse_args()
    directory = Path(arguments.state_dir)
    if not directory.is_absolute(): raise RuntimeError('An absolute private data directory is required')
    if directory.exists() and (directory.is_symlink() or directory.is_junction()):
        raise RuntimeError('The private data directory must not be a link')
    if arguments.mode == 'describe':
        keys = load_keys(directory) if directory.exists() else None
        record_path = directory / 'service.json'
        record = json.loads(record_path.read_text(encoding='utf8')) if record_path.exists() else None
        value = {'record': record, 'has_keys': keys is not None}
        value['managed_registration'] = (directory / 'provider-registration.json').is_file()
        account_file = directory / 'accounts.json'
        value['account_count'] = len(json.loads(account_file.read_text(encoding='utf8')).get('accounts', [])) if account_file.is_file() else 0
        if arguments.internal: value['keys'] = keys
        print(json.dumps(value)); return
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if sys.stdout is None: sys.stdout = open(os.devnull, 'w', encoding='utf8')
    if sys.stderr is None: sys.stderr = open(os.devnull, 'w', encoding='utf8')
    asyncio.run(serve(directory))


if __name__ == '__main__':
    try: main()
    except Exception:
        # No raw request, session, token, cookie, environment or account path.
        print('Managed DSW2API operation failed', file=sys.stderr)
        raise SystemExit(1)
