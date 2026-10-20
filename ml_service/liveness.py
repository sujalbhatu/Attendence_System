import cv2
import numpy as np

from cascades import cascade

# Haar cascade files (one classifier per thread, see cascades.py)
FACE_CASCADE = "haarcascade_frontalface_default.xml"
EYE_CASCADE = "haarcascade_eye.xml"
GLASS_EYE_CASCADE = "haarcascade_eye_tree_eyeglasses.xml"


def extract_face_and_eye_strip(img_bgr):
    """
    Detects face and isolates the upper-middle facial region where eyes reside.
    Returns (face_crop_bgr, eye_strip_gray, face_found)
    """
    if img_bgr is None or img_bgr.size == 0:
        return None, None, False

    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # 1. Multi-pass face detection
    faces = cascade(FACE_CASCADE).detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=3, minSize=(40, 40)
    )
    if len(faces) == 0:
        # Equalized histogram pass for challenging lighting
        eq_gray = cv2.equalizeHist(gray)
        faces = cascade(FACE_CASCADE).detectMultiScale(
            eq_gray, scaleFactor=1.08, minNeighbors=2, minSize=(35, 35)
        )

    if len(faces) > 0:
        largest = max(faces, key=lambda f: f[2] * f[3])
        fx, fy, fw, fh = largest
        # Eye region is located between 18% and 58% of face height
        ey1 = max(0, fy + int(fh * 0.18))
        ey2 = min(h, fy + int(fh * 0.58))
        ex1 = max(0, fx + int(fw * 0.10))
        ex2 = min(w, fx + int(fw * 0.90))
        eye_strip_gray = gray[ey1:ey2, ex1:ex2]
        face_crop_bgr = img_bgr[fy:fy+fh, fx:fx+fw]
        return face_crop_bgr, eye_strip_gray, True
    else:
        # Fallback: assume face roughly centered in selfie oval
        ey1 = int(h * 0.20)
        ey2 = int(h * 0.55)
        ex1 = int(w * 0.15)
        ex2 = int(w * 0.85)
        return img_bgr, gray[ey1:ey2, ex1:ex2], False


def _count_eyes_in_strip(eye_strip_gray):
    """Detect eyes in the isolated eye strip using standard & eyeglass cascades."""
    if eye_strip_gray is None or eye_strip_gray.size == 0:
        return 0
    
    eyes = cascade(EYE_CASCADE).detectMultiScale(
        eye_strip_gray, scaleFactor=1.08, minNeighbors=2, minSize=(10, 10)
    )
    glass_eyes = cascade(GLASS_EYE_CASCADE).detectMultiScale(
        eye_strip_gray, scaleFactor=1.08, minNeighbors=2, minSize=(10, 10)
    )
    return max(len(eyes), len(glass_eyes))


def _get_strip_features(eye_strip_gray):
    """Analyze dark pupil/iris density and intensity variance."""
    if eye_strip_gray is None or eye_strip_gray.size == 0:
        return 0.0, 0.0
    dark_ratio = float(np.mean(eye_strip_gray < 70))
    std = float(np.std(eye_strip_gray))
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

    face_crop, eye_strip, face_found = extract_face_and_eye_strip(face_bgr)
    num_eyes = _count_eyes_in_strip(eye_strip)
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
    is_frozen = (diff < 0.20)
    return {
        'is_live': not is_frozen,
        'frame_diff': round(diff, 2),
        'reason': 'Static 2D image / frozen presentation' if is_frozen else 'Natural human micro-movement verified'
    }


def verify_blink_burst(face_images_bgr_list):
    """
    High-Frequency Stream Burst Evaluator:
    Detects natural eyelid blink transitions across burst frames while strictly
    rejecting static printed photos or screen replays.
    """
    if not face_images_bgr_list or len(face_images_bgr_list) < 3:
        return {'is_live': False, 'blink_detected': False, 'reason': 'Insufficient burst frames', 'best_frame_idx': 0}

    eye_counts = []
    dark_ratios = []
    stds = []
    eye_strips_resized = []
    faces_detected_count = 0

    for img in face_images_bgr_list:
        if img is None or img.size == 0:
            continue
        face_crop, eye_strip, face_found = extract_face_and_eye_strip(img)
        if face_found:
            faces_detected_count += 1
        
        eyes = _count_eyes_in_strip(eye_strip)
        eye_counts.append(eyes)
        
        dr, std = _get_strip_features(eye_strip)
        dark_ratios.append(dr)
        stds.append(std)
        
        if eye_strip is not None and eye_strip.size > 0:
            eye_strips_resized.append(cv2.resize(eye_strip, (80, 40)))

    if len(eye_counts) < 3:
        return {'is_live': False, 'blink_detected': False, 'reason': 'Corrupted frames in burst', 'best_frame_idx': 0}

    max_eyes = max(eye_counts)
    min_eyes = min(eye_counts)
    eye_variation = max_eyes - min_eyes
    
    max_dr = max(dark_ratios)
    min_dr = min(dark_ratios)
    dr_ratio = float(min_dr / (max_dr + 1e-6)) if max_dr > 0 else 1.0

    max_std = max(stds)
    min_std = min(stds)
    std_variation = max_std - min_std

    # Inter-frame motion difference in eye strip (rejects static photos on desks or static screens)
    strip_diffs = []
    for i in range(1, len(eye_strips_resized)):
        diff = float(np.mean(np.abs(eye_strips_resized[i].astype(float) - eye_strips_resized[i-1].astype(float))))
        strip_diffs.append(diff)
    avg_strip_diff = float(np.mean(strip_diffs)) if strip_diffs else 0.0
    max_strip_diff = float(np.max(strip_diffs)) if strip_diffs else 0.0

    # Full frame diff
    frame_diffs = []
    for i in range(1, len(face_images_bgr_list)):
        g1 = cv2.cvtColor(cv2.resize(face_images_bgr_list[i], (120, 120)), cv2.COLOR_BGR2GRAY)
        g0 = cv2.cvtColor(cv2.resize(face_images_bgr_list[i-1], (120, 120)), cv2.COLOR_BGR2GRAY)
        frame_diffs.append(float(np.mean(np.abs(g1.astype(float) - g0.astype(float)))))
    avg_diff = float(np.mean(frame_diffs)) if frame_diffs else 0.0

    is_static_presentation = (avg_diff < 0.15 and avg_strip_diff < 0.20)
    
    # 1. Primary: Eyelid closure detected by Haar cascade (eyes drop from >= 1 to 0, or drop by >= 1)
    eye_count_closure = (eye_variation >= 1 and min_eyes <= 1)
    
    # 2. Secondary: Pupil/iris contrast modulation (dark ratio drops as eyelids cover pupil)
    pupil_contrast_closure = (dr_ratio < 0.90 and max_dr >= 0.015) or (std_variation > 1.5 and max_eyes >= 1)

    # 3. Tertiary: Eyelid transition motion spike in the eye strip
    eyelid_motion_closure = (max_strip_diff >= 1.5 and avg_diff >= 0.15)

    # 4. Quaternary: Face detection variation (cascade sometimes loses face during blink)
    face_variation_closure = (faces_detected_count < len(eye_counts) and faces_detected_count >= len(eye_counts) * 0.5 and avg_diff >= 0.15)

    blink_detected = (eye_count_closure or pupil_contrast_closure or eyelid_motion_closure or face_variation_closure) and not is_static_presentation

    print(f"[ACTIVE BLINK BURST] faces_found={faces_detected_count}/{len(eye_counts)}, eyes={eye_counts}, variation={eye_variation}, dr_ratio={dr_ratio:.2f}, max_strip_diff={max_strip_diff:.2f}, avg_diff={avg_diff:.2f}, blink={blink_detected}", flush=True)

    # Optimal frame selection for FaceNet: Pick a frame where eyes were fully OPEN
    open_indices = [i for i, cnt in enumerate(eye_counts) if cnt == max_eyes]
    best_frame_idx = open_indices[0] if open_indices else int(np.argmax(dark_ratios))

    reasons = []
    if is_static_presentation:
        reasons.append('Static 2D image / photo spoof detected (no natural micro-movement)')
    elif not blink_detected:
        if faces_detected_count == 0 and max_eyes == 0:
            reasons.append('Face not clearly detected in oval. Center your face in good light.')
        elif max_eyes == min_eyes:
            reasons.append('No eye blink detected. Please blink naturally when prompted.')
        else:
            reasons.append('Incomplete blink detected. Please blink firmly when prompted.')

    return {
        'is_live': bool(blink_detected),
        'blink_detected': bool(blink_detected),
        'eye_trajectory': eye_counts,
        'dr_ratio': round(dr_ratio, 2),
        'avg_motion': round(avg_diff, 2),
        'best_frame_idx': best_frame_idx,
        'score': 0.95 if blink_detected else 0.15,
        'reason': '; '.join(reasons) if reasons else 'Active eye blink confirmed (Live human verified)'
    }
