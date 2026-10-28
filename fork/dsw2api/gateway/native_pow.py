"""Owned, bounded native PoW process; never executes a shell command."""
import asyncio
import os
from pathlib import Path
import subprocess
import time
from managed_transport import REQUEST_CANCEL


class NativeSolver:
    def __init__(self, error_type=RuntimeError):
        self.error_type = error_type
        helper = os.environ.get('CLINE_DSW_POW_HELPER', '')
        self.helper = Path(helper)
        if not helper or not self.helper.is_absolute() or not self.helper.is_file():
            raise error_type('Bundled native PoW helper is unavailable')

    def solve(self, challenge, salt, expire_at, difficulty):
        cancellation = REQUEST_CANCEL.get()
        if cancellation is not None and cancellation.is_set():
            raise asyncio.CancelledError()
        if not isinstance(challenge, str) or len(challenge) != 64:
            raise self.error_type('Invalid PoW challenge')
        try:
            if int(difficulty) <= 0 or int(difficulty) > 100_000_000:
                raise ValueError()
            command = [str(self.helper), 'solve', challenge, str(salt), str(int(expire_at)), str(int(difficulty))]
        except (ValueError, TypeError, OverflowError):
            raise self.error_type('Invalid PoW difficulty') from None
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        deadline = time.monotonic() + 90
        try:
            while True:
                if cancellation is not None and cancellation.is_set():
                    raise asyncio.CancelledError()
                if time.monotonic() > deadline:
                    raise self.error_type('PoW computation timed out')
                try:
                    output, _ = process.communicate(timeout=.05)
                    break
                except subprocess.TimeoutExpired:
                    continue
            if process.returncode != 0 or len(output) > 32:
                raise self.error_type('PoW solution unavailable')
            try:
                nonce = int(output.strip())
            except (ValueError, TypeError):
                raise self.error_type('Invalid native PoW result') from None
            if not 0 <= nonce < int(difficulty):
                raise self.error_type('Invalid native PoW result')
            return nonce
        finally:
            if process.poll() is None:
                process.kill()
            process.communicate(timeout=5)
