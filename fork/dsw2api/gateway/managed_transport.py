"""Request-scoped cancellation, including a silent upstream connection."""
import asyncio
import contextvars
import threading
from curl_cffi import Curl, CurlOpt
from curl_cffi.curl import CurlError
from curl_cffi._wrapper import ffi, lib
from curl_cffi.requests import Session, Response

REQUEST_CANCEL = contextvars.ContextVar('cline_dsw_request_cancel', default=None)


class ProgressCurl(Curl):
    def setopt(self, option, value):
        if option == CurlOpt.XFERINFOFUNCTION:
            # The pinned wrapper exposes the enum but not this function-pointer
            # option. Use its existing native shim, only for our owned handles.
            code = lib._curl_easy_setopt(self._curl, int(option), value)
            if code:
                raise CurlError('Could not configure request cancellation', code)
            return code
        return super().setopt(option, value)

    def duphandle(self):
        duplicate = super().duphandle()
        duplicate.__class__ = ProgressCurl
        return duplicate


class CancellableResponse(Response):
    def iter_content(self, *args, **kwargs):
        try:
            yield from super().iter_content(*args, **kwargs)
        except Exception:
            event = getattr(self, '_cline_cancel_event', None)
            if event is not None and event.is_set():
                raise asyncio.CancelledError() from None
            raise


class CancellableSession(Session):
    def __init__(self, *args, **kwargs):
        kwargs['response_class'] = CancellableResponse
        super().__init__(*args, **kwargs)
        self._cline_options_lock = threading.RLock()

    @property
    def curl(self):
        handle = super().curl
        if not isinstance(handle, ProgressCurl):
            handle.__class__ = ProgressCurl
        return handle

    def request(self, method, url, **kwargs):
        cancellation = REQUEST_CANCEL.get()

        @ffi.callback('int(void *, long long, long long, long long, long long)')
        def progress(_context, _download_total, _download_now, _upload_total, _upload_now):
            return int(cancellation is not None and cancellation.is_set())

        if cancellation is not None and cancellation.is_set():
            raise asyncio.CancelledError()
        # A generation can run until the model finishes; connecting is bounded.
        # libcurl's progress callback aborts even while no response bytes arrive.
        generation = str(url).split('?', 1)[0].endswith('/chat/completion')
        if generation:
            kwargs['timeout'] = None
        with self._cline_options_lock:
            previous = self.curl_options
            self.curl_options = {
                **previous,
                CurlOpt.NOPROGRESS: 0,
                CurlOpt.XFERINFOFUNCTION: ffi.cast('void *', progress),
                CurlOpt.CONNECTTIMEOUT_MS: 15_000,
            }
            try:
                response = super().request(method, url, **kwargs)
                # A streamed request outlives request(); keep the C callback alive
                # until the response and its curl worker have finished.
                response._cline_progress_callback = progress
                response._cline_cancel_event = cancellation
                return response
            except Exception:
                if cancellation is not None and cancellation.is_set():
                    raise asyncio.CancelledError() from None
                raise
            finally:
                self.curl_options = previous
