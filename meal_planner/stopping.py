"""``StopHandle``: stops a running ``plan()`` from another thread.

A stopped search returns what it has, as when time runs out: the best plan
found (FEASIBLE) or none (TIMEOUT_NO_SOLUTION). Solves not yet started are
skipped, also the extra solves that look for a minimal conflict.
"""

import threading


class StopHandle:
    """Pass one to ``plan()``; ``stop()`` may be called from any thread, any
    number of times, before, during or after the solve."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stopped = False
        # The running search: anything with stop_search(), set by the backend.
        self._search = None

    @property
    def stopped(self) -> bool:
        return self._stopped

    def stop(self) -> None:
        with self._lock:
            self._stopped = True
            search = self._search
        if search is not None:
            search.stop_search()

    def _attach(self, search) -> bool:
        """Make ``search`` the one ``stop()`` stops; False if already stopped,
        and then the search should not start."""
        with self._lock:
            if self._stopped:
                return False
            self._search = search
            return True

    def _detach(self) -> None:
        with self._lock:
            self._search = None
