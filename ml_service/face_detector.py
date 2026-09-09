import cv2
import numpy as np
from PIL import Image

_model_file = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_face_cascade = cv2.CascadeClassifier(_model_file)


def _detect_faces(image_bgr):
    """Detect faces using OpenCV Haar cascade with fallback passes."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    
    # 1. Standard detection
    faces = _face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=4,
        minSize=(50, 50),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    if len(faces) > 0:
        return faces

    # 2. Histogram equalization pass (helps with backlight/dim light)
    eq_gray = cv2.equalizeHist(gray)
    faces = _face_cascade.detectMultiScale(
        eq_gray,
        scaleFactor=1.08,
        minNeighbors=3,
        minSize=(40, 40),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    if len(faces) > 0:
        return faces

    # 3. Looser detection pass
    faces = _face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.05,
        minNeighbors=3,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    return faces


def _crop_with_margin(image_rgb, x, y, w, h, margin=0.2):
    """Crop face region with padding margin, clamped to image bounds."""
    ih, iw = image_rgb.shape[:2]
    margin_x = int(w * margin)
    margin_y = int(h * margin)

    nx = max(0, x - margin_x)
    ny = max(0, y - margin_y)
    nw = min(iw - nx, w + 2 * margin_x)
    nh = min(ih - ny, h + 2 * margin_y)

    cropped = image_rgb[ny:ny + nh, nx:nx + nw]
    if cropped.size == 0:
        return None, None

    cropped_pil = Image.fromarray(cropped)
    bbox_dict = {'x': int(nx), 'y': int(ny), 'w': int(nw), 'h': int(nh)}
    return cropped_pil, bbox_dict


def detect_and_crop(image_path):
    """Detect and crop the largest face from an image file path."""
    image = cv2.imread(image_path)
    if image is None:
        return None, None

    faces = _detect_faces(image)
    if len(faces) == 0:
        return None, None

    largest = max(faces, key=lambda f: f[2] * f[3])
    x, y, w, h = largest

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return _crop_with_margin(image_rgb, x, y, w, h)


def detect_and_crop_from_bytes(image_bytes):
    """Detect and crop the largest face from raw image bytes."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return None, None

    faces = _detect_faces(image)
    if len(faces) == 0:
        return None, None

    largest = max(faces, key=lambda f: f[2] * f[3])
    x, y, w, h = largest

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return _crop_with_margin(image_rgb, x, y, w, h)
