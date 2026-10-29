"""Offline integration using bundled Python, actual curl/native PoW and HTTP/SSE.

No external service requests, user configuration or GPU inference.
"""
import asyncio
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

resources = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(resources / 'gateway'))
import managed_runner

calls = []
reject_challenge = False
token = 'synthetic-own-session-not-a-real-credential'
answer = '<tool_calls><invoke name="read_fixture"><parameter name="path"><![CDATA[fixture.txt]]></parameter></invoke></tool_calls>'
helper = resources / 'cline-dsw2api-pow.exe'
challenge = subprocess.check_output([str(helper), 'hash', 'fixture_1700000000_0'], text=True).strip()


class FakeDeepSeek(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args): pass
    def response(self, value, code=200):
        payload = json.dumps(value).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
    def do_GET(self):
        if self.path != '/api/v0/users/current': return self.response({}, 404)
        if self.headers.get('Authorization') != 'Bearer ' + token: return self.response({'code': 401}, 401)
        self.response({'code': 0, 'data': {'biz_code': 0, 'biz_data': {'id': 'synthetic-user'}}})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        if self.path.endswith('/create_pow_challenge'):
            if reject_challenge:return self.response({'code':40003,'msg':'Authorization Failed (invalid token)','data':None})
            return self.response({'code': 0, 'data': {'biz_data': {'challenge': {'challenge': challenge, 'salt': 'fixture', 'expire_at': 1700000000, 'difficulty': 1, 'signature': 'synthetic', 'target_path': '/api/v0/chat/completion'}}}})
        if self.path.endswith('/chat_session/create'): return self.response({'code': 0, 'data': {'biz_data': {'id': 'synthetic-session'}}})
        if self.path.endswith('/chat/completion'):
            proof = json.loads(base64.b64decode(self.headers['X-DS-PoW-Response']))
            assert proof['answer'] == 0
            calls.append(body)
            if 'VENDOR_THROTTLE_FIXTURE' in body['prompt']:
                payload = b'event: hint\ndata: {"type":"error","content":"synthetic vendor throttle","finish_reason":"rate_limit_reached"}\n\n'
                self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload); return
            if 'RECOVERABLE_STREAM_FIXTURE' in body['prompt']:
                payload=b'event: hint\ndata: {"type":"error","content":"synthetic request failure","finish_reason":"server_error"}\n\n'
                self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload); return
            output = answer if len(calls) == 1 else 'Fixture task completed.'
            events = [('ready', {'response_message_id': 100 + len(calls)}), ('', {'p': 'response/content', 'o': 'APPEND', 'v': output}), ('', {'p': 'response/status', 'o': 'SET', 'v': 'FINISHED'})]
            payload = ''.join((f'event: {kind}\n' if kind else '') + 'data: ' + json.dumps(value) + '\n\n' for kind, value in events).encode() + b'data: [DONE]\n\n'
            self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload); return
        self.response({}, 404)


stub = http.server.ThreadingHTTPServer(('127.0.0.1', 0), FakeDeepSeek)
threading.Thread(target=stub.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory(prefix='cline-dsw-synthetic-') as temp:
    # Synthetic requests must never contend with a real personal account.
    os.environ['LOCALAPPDATA'] = temp
    directory = Path(temp); keys = managed_runner.load_keys(directory, create=True)
    managed_runner.configure_environment(directory, keys)
    import adapter
    adapter.BASE_URL = f'http://127.0.0.1:{stub.server_port}'
    adapter._HifProvider.headers = lambda self: {}  # No external HIF request in tests.
    import server
    original_tokens = server.ChatService.tokens
    def delayed_close(*args, **kwargs):
        try: yield from original_tokens(*args, **kwargs)
        finally: time.sleep(.35)
    server.ChatService.tokens = staticmethod(delayed_close)
    import uvicorn
    listener = socket.socket(); listener.bind(('127.0.0.1', 0)); listener.listen(128)
    port = listener.getsockname()[1]
    app = managed_runner.ManagedApp(server, directory, keys, {'pid': 1, 'port': port, 'build_id': 'synthetic', 'instance_id': 'fixture', 'fixture': True})
    service = uvicorn.Server(uvicorn.Config(app, access_log=False, log_level='error'))
    app.server = service
    worker = threading.Thread(target=lambda: asyncio.run(service.serve(sockets=[listener])), daemon=True); worker.start()
    while not service.started:
        if not worker.is_alive(): raise RuntimeError('Fixture gateway failed')
        time.sleep(.02)
    def request(path, body=None, control=False):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f'http://127.0.0.1:{port}' + path, data=data, headers={'Authorization': 'Bearer ' + keys['control' if control else 'client'], 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                if path != '/v1/chat/completions': return response.status, response.read().decode()
                lines = []
                for line in response:
                    lines.append(line)
                    if line.strip() == b'data: [DONE]': break
                return response.status, b''.join(lines).decode()
        except urllib.error.HTTPError as error: return error.code, error.read().decode()
    try:
        assert request('/control/session', {'token': token}, True)[0] == 200
        persisted = (directory / 'accounts.json').read_text(encoding='utf8'); assert token not in persisted
        from account_pool import AccountPool
        assert AccountPool().count() == 1  # Token-only account survives reload.
        before = hashlib.sha256((directory / 'accounts.json').read_bytes()).hexdigest()
        assert request('/control/session', {'token': 'synthetic-invalid'}, True)[0] == 401
        assert hashlib.sha256((directory / 'accounts.json').read_bytes()).hexdigest() == before
        tools = [{'type': 'function', 'function': {'name': 'read_fixture', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path']}}}]
        messages = [{'role': 'user', 'content': 'Read fixture.txt with read_fixture.'}]
        payload = {'model': 'deepseek-web', 'user': 'synthetic-independent-conversation', 'messages': messages, 'tools': tools, 'stream': True, 'reasoning_effort': 'high', 'max_tokens': -1}
        code, text = request('/v1/chat/completions', payload)
        assert code == 200 and 'tool_calls' in text and 'read_fixture' in text, text
        chunks = [json.loads(line[6:]) for line in text.splitlines() if line.startswith('data: ') and line[6:] != '[DONE]']
        tool_calls = [call for chunk in chunks for choice in chunk.get('choices', []) for call in choice.get('delta', {}).get('tool_calls', [])]
        assert tool_calls
        function = ''.join(call.get('function', {}).get('arguments', '') for call in tool_calls)
        assert json.loads(function) == {'path': 'fixture.txt'}
        tool_id = next(call['id'] for call in tool_calls if 'id' in call)
        messages += [{'role': 'assistant', 'tool_calls': [{'id': tool_id, 'type': 'function', 'function': {'name': 'read_fixture', 'arguments': function}}]}, {'role': 'tool', 'tool_call_id': tool_id, 'content': 'synthetic fixture contents ' * 100 + 'FULL_RESULT_END'}]
        code, text = request('/v1/chat/completions', {**payload, 'messages': messages})
        assert code == 200 and 'Fixture task completed.' in text, text
        assert calls[0]['thinking_enabled'] is True and calls[1]['thinking_enabled'] is True
        assert all('max_tokens' not in call for call in calls)
        assert calls[1]['parent_message_id'] == 101, calls[1]
        assert 'FULL_RESULT_END' in calls[1]['prompt']
        code, text = request('/v1/chat/completions', {**payload, 'messages': messages, 'reasoning_effort': 'none', 'search_enabled': True})
        assert code == 200 and calls[2]['thinking_enabled'] is False and calls[2]['search_enabled'] is True
        code, text = request('/v1/chat/completions', {**payload, 'messages': messages, 'search_enabled': False})
        assert code == 200 and calls[3]['thinking_enabled'] is True and calls[3]['search_enabled'] is False
        # A second application owns the browser-account lease. A cancelled
        # waiter must send nothing; the next live waiter continues after release.
        holder = subprocess.Popen([sys.executable, '-B', str(Path(__file__).with_name('test-browser-lease.py')), '--child', '--hold'],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            assert holder.stdout.readline().strip() == 'acquired'
            before_shared = len(calls)
            queued_payload = {**payload, 'user': 'shared-client-cancel', 'messages': [{'role':'user','content':'Cancelled before vendor submission'}]}
            body = json.dumps(queued_payload).encode()
            client = socket.create_connection(('127.0.0.1', port), timeout=5)
            client.sendall((f'POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {keys["client"]}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n').encode() + body)
            time.sleep(.2)
            assert len(calls) == before_shared
            client.close()
            time.sleep(.3)
            result = []
            waiter = threading.Thread(target=lambda: result.append(request('/v1/chat/completions', {**queued_payload, 'user':'shared-client-continue'})))
            waiter.start()
            time.sleep(.2)
            assert waiter.is_alive() and len(calls) == before_shared
            holder.stdin.write('\n'); holder.stdin.flush()
            holder.communicate(timeout=5)
            waiter.join(10)
            assert not waiter.is_alive() and result[0][0] == 200
            assert len(calls) == before_shared + 1, 'Cancelled shared waiter reached the vendor'
        finally:
            if holder.poll() is None:
                holder.kill(); holder.wait()
        before_calls = len(calls)
        code, text = request('/v1/chat/completions', {**payload, 'user': 'synthetic-throttle-conversation', 'messages': [{'role':'user','content':'VENDOR_THROTTLE_FIXTURE'}]})
        assert len(calls) == before_calls + 1 and ('error' in text or code == 429), text
        code, text = request('/v1/chat/completions', {**payload, 'model': 'not-a-real-model'})
        assert code == 422
        saved_account=(directory/'accounts.json').read_bytes()
        before_calls=len(calls)
        code,text=request('/v1/chat/completions',{**payload,'user':'synthetic-recoverable-error','messages':[{'role':'user','content':'RECOVERABLE_STREAM_FIXTURE'}]})
        assert code==200 and 'error' in text and len(calls)==before_calls+1
        code,text=request('/v1/chat/completions',{**payload,'user':'synthetic-after-error','messages':[{'role':'user','content':'Healthy request after a transient failure'}],'search_enabled':True})
        assert code==200 and 'Fixture task completed.' in text, text
        assert (directory/'accounts.json').read_bytes()==saved_account
        reject_challenge = True
        code,text=request('/v1/chat/completions',{**payload,'user':'synthetic-expired-auth','messages':[{'role':'user','content':'Do not call upstream with an invalid session'}]})
        assert code==401 and 'deepseek_session_expired' in text and 'All accounts busy' not in text
        before_calls=len(calls)
        code,text=request('/v1/chat/completions',{**payload,'user':'synthetic-expired-auth-repeat','messages':[{'role':'user','content':'Still invalid'}]})
        assert code==401 and len(calls)==before_calls
        code,text=request('/control/status',control=True)
        assert code==200 and json.loads(text)['authorization_required'] and not json.loads(text)['configured']
        assert (directory/'accounts.json').read_bytes()==saved_account
        reject_challenge = False
        code,text=request('/control/session',{'token':token,'cookies':''},control=True)
        assert code==200
        code,text=request('/v1/chat/completions',{**payload,'user':'synthetic-after-explicit-reconnect','messages':[{'role':'user','content':'Healthy request after verified reconnect'}]})
        assert code==200 and 'Fixture task completed.' in text
        print(json.dumps({'passed': True, 'real_upstream_requests': 0, 'actual_native_pow': True, 'streaming_tool_result_parent_chain': True, 'reasoning_high_then_none': True, 'session_encrypted_reload_and_invalid_preservation': True, 'no_gateway_output_cap': True}))
    finally:
        service.should_exit = True; worker.join(5); stub.shutdown(); os.chdir(resources)
