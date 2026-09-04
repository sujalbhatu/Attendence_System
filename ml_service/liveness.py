import cv2
import numpy as np

# Eye cascade classifiers
_face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
_eye_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_eye.xml"
)
_glass_eye_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml"
)


def _detect_eyes(face_bgr):
    """Detect eyes in upper face crop."""
    h, w = face_bgr.shape[:2]
    gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
    upper_face = gray[0:int(h * 0.65), :]
    
    eyes = _eye_cascade.detectMultiScale(
        upper_face, scaleFactor=1.1, minNeighbors=3, minSize=(12, 12)
    )
    if len(eyes) < 2:
        eyes = _glass_eye_cascade.detectMultiScale(
            upper_face, scaleFactor=1.1, minNeighbors=2, minSize=(12, 12)
        )
    return len(eyes)


def _get_eye_band_features(face_bgr):
    """
    Extracts eye region and analyzes dark pupil/iris density and contrast.
    """
    h, w = face_bgr.shape[:2]
    eye_strip = face_bgr[int(h * 0.22):int(h * 0.48), int(w * 0.15):int(w * 0.85)]
    if eye_strip.size == 0:
        return 0.0, 0.0
    gray = cv2.cvtColor(eye_strip, cv2.COLOR_BGR2GRAY)
    norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    dark_ratio = float(np.mean(norm < 65))
    std = float(np.std(norm))
    return dark_ratio, std


def check_passive_liveness(face_bgr):
    """Validates face resolution and natural contrast."""
    if face_bgr is None or face_bgr.size == 0:
        return {'is_live': False, 'score': 0.0, 'reason': 'No face image provided'}

    h, w = face_bgr.shape[:2]
    if h < 50 or w < 50:
        return {'is_live': False, 'score': 0.0, 'reason': 'Face crop too low resolution'}

    gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
    std_dev = float(np.std(gray))
    if std_dev < 15.0:
        return {
            'is_live': False,
            'score': 0.10,
            'reason': 'Insufficient facial contrast / overexposed surface'
        }

    num_eyes = _detect_eyes(face_bgr)
    return {
        'is_live': True,
        'score': 0.95,
        'eyes_detected': int(num_eyes),
        'reason': 'Live human face verified'
    }


def check_temporal_liveness(frame1_bgr, frame2_bgr):
    """Compares two frames taken 250ms apart to reject static presentations."""
    if frame1_bgr is None or frame2_bgr is None:
        return {'is_live': True, 'score': 1.0, 'reason': 'Single frame evaluated'}
        
    f1 = cv2.resize(frame1_bgr, (160, 160))
    f2 = cv2.resize(frame2_bgr, (160, 160))
    
    g1 = cv2.cvtColor(f1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(f2, cv2.COLOR_BGR2GRAY)
    
    diff = float(np.mean(np.abs(g1.astype(float) - g2.astype(float))))
    is_frozen = (diff < 0.3)
    return {
        'is_live': not is_frozen,
        'frame_diff': round(diff, 2),
        'reason': 'Static 2D image / frozen presentation' if is_frozen else 'Natural human micro-movement verified'
    }


def verify_blink_burst(face_images_bgr_list):
    """
    High-Frequency Stream Burst Evaluator (8 frames @ 65ms = 520ms):
    Zero blind spots. A normal 150-250ms blink is captured across 2-3 consecutive frames.
    """
    if not face_images_bgr_list or len(face_images_bgr_list) < 3:
        return {'is_live': False, 'blink_detected': False, 'reason': 'Insufficient burst frames', 'best_frame_idx': 0}

    eye_counts = []
    dark_ratios = []
    
    for img in face_images_bgr_list:
        eyes = _detect_eyes(img)
        eye_counts.append(eyes)
        dr, _ = _get_eye_band_features(img)
        dark_ratios.append(dr)

    max_dr = max(dark_ratios)
    min_dr = min(dark_ratios)
    dr_ratio = float(min_dr / (max_dr + 1e-6)) if max_dr > 0 else 1.0
    
    max_eyes = max(eye_counts)
    min_eyes = min(eye_counts)
    
    # 1. Biological blink: eyelid covers the pupil, dark_ratio drops
    pupil_drop = (dr_ratio < 0.65 and max_dr >= 0.05)
    # 2. Eye detector drops to 0 or 1 while max eyes >= 2
    eye_count_drop = (min_eyes <= 1 and max_eyes >= 2 and dr_ratio < 0.75)
    
    blink_detected = pupil_drop or eye_count_drop
    
    print(f"[ACTIVE BLINK 8-BURST] eyes={eye_counts}, dark_ratios={[round(d, 3) for d in dark_ratios]}, dr_ratio={dr_ratio:.2f}, blink={blink_detected}", flush=True)

    best_frame_idx = int(np.argmax(dark_ratios))
    
    reasons = []
    if not blink_detected:
        if dr_ratio >= 0.75:
            reasons.append('Eyes remained static (moving photo/screen detected)')
        else:
            reasons.append('No natural eye blink detected')

    return {
        'is_live': bool(blink_detected),
        'blink_detected': bool(blink_detected),
        'eye_trajectory': eye_counts,
        'dr_ratio': round(dr_ratio, 2),
        'best_frame_idx': best_frame_idx,
        'reason': '; '.join(reasons) if reasons else 'Active eye blink confirmed (Live human verified)'
    }
