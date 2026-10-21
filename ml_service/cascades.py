import threading

import cv2

# cv2.CascadeClassifier is not thread-safe: Flask serves requests on several threads,
# and two threads calling detectMultiScale on one shared instance crash with
# "cv2.error: invalid vector subscript". Each thread gets its own copy instead.
_local = threading.local()


def cascade(name):
    """Return this thread's classifier for a bundled Haar cascade file, loading it once."""
    cache = getattr(_local, 'cache', None)
    if cache is None:
        cache = _local.cache = {}
    clf = cache.get(name)
    if clf is None:
        clf = cache[name] = cv2.CascadeClassifier(cv2.data.haarcascades + name)
    return clf
