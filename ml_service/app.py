import os
import cv2
import numpy as np
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True
import io
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from recognizer import FaceRecognizer, cosine_similarity
from liveness import check_passive_liveness, check_temporal_liveness, verify_blink_burst
from batch_worker import BatchInferenceProcessor
from face_detector import _detect_faces, _crop_with_margin

app = Flask(__name__)
CORS(app)

print("[INFO] Initializing CampusTrack FaceNet ML Engine...")
recognizer = FaceRecognizer(device='cpu')
batch_processor = BatchInferenceProcessor(recognizer.model, device='cpu')
print("[INFO] CampusTrack FaceNet Engine Ready on Port 5001.")

def pil_from_bytes(file_bytes):
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.load()
        return img.convert('RGB')
    except Exception:
        arr = np.frombuffer(file_bytes, np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is not None:
            return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        raise

def cv2_from_bytes(file_bytes):
    arr = np.frombuffer(file_bytes, np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        try:
            pil = Image.open(io.BytesIO(file_bytes)).convert('RGB')
            return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception:
            return None
    return bgr

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'CampusTrack ML Engine',
        'model': 'InceptionResnetV1 (vggface2)',
        'embedding_size': 512,
        'threshold': 0.65
    })

@app.route('/embed', methods=['POST'])
def embed():
    """Extracts 512-d L2-normalized embedding for student enrollment with face alignment."""
    files = request.files.getlist('images')
    if not files and 'image' in request.files:
        files = [request.files['image']]

    if not files:
        return jsonify({'error': 'No image provided'}), 400

    cropped_face_images = []
    for f in files:
        try:
            raw_bytes = f.read()
            bgr = cv2_from_bytes(raw_bytes)
            pil = pil_from_bytes(raw_bytes)
            
            face_cropped = None
            if bgr is not None:
                faces = _detect_faces(bgr)
                if len(faces) > 0:
                    largest = max(faces, key=lambda fc: fc[2] * fc[3])
                    x, y, w, h = largest
                    rgb_frame = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    crop_pil, _ = _crop_with_margin(rgb_frame, x, y, w, h, margin=0.20)
                    if crop_pil:
                        face_cropped = crop_pil

            if face_cropped is not None:
                cropped_face_images.append(face_cropped)
            elif pil:
                cropped_face_images.append(pil)
        except Exception as e:
            print(f"[WARN] Skipped enrollment frame: {e}", flush=True)

    if not cropped_face_images:
        return jsonify({'error': 'No valid face images could be decoded'}), 400

    embedding = recognizer.enroll(cropped_face_images)
    return jsonify({
        'embedding': embedding.tolist(),
        'dimensions': len(embedding),
        'num_samples': len(cropped_face_images)
    })

@app.route('/verify', methods=['POST'])
def verify():
    """
    Verifies probe face against enrolled embedding with active blink liveness.
    Supports single frame or multi-frame burst.
    """
    enrolled_embedding_str = request.form.get('enrolled_embedding')
    gallery_str = request.form.get('gallery')
    require_liveness = request.form.get('require_liveness', 'true').lower() == 'true'
    threshold = float(request.form.get('threshold', 0.65))

    files = request.files.getlist('images')
    if not files and 'image' in request.files:
        files = [request.files['image']]

    if not files:
        return jsonify({'error': 'No image files provided'}), 400

    file_bytes_list = [f.read() for f in files]
    bgr_list = []
    pil_list = []
    for b in file_bytes_list:
        try:
            bgr = cv2_from_bytes(b)
            pil = pil_from_bytes(b)
            if bgr is not None and pil is not None:
                bgr_list.append(bgr)
                pil_list.append(pil)
        except Exception as img_err:
            print(f"[WARN] Skipped frame: {img_err}", flush=True)

    if not bgr_list:
        return jsonify({'error': 'Failed to decode any valid image frames'}), 400

    liveness_result = {'is_live': True, 'score': 1.0, 'reason': 'Liveness check bypassed'}
    best_pil_img = pil_list[0]

    # Active blink verification if burst frames provided
    if require_liveness:
        if len(bgr_list) >= 3:
            liveness_result = verify_blink_burst(bgr_list)
            best_idx = liveness_result.get('best_frame_idx', 0)
            best_pil_img = pil_list[best_idx]
        else:
            liveness_result = check_passive_liveness(bgr_list[0])

        if not liveness_result.get('is_live', False):
            return jsonify({
                'matched': False,
                'liveness': liveness_result,
                'error': f"Spoof / Liveness failure: {liveness_result.get('reason')}"
            }), 200

    best_pil_to_embed = best_pil_img
    best_idx = liveness_result.get('best_frame_idx', 0) if require_liveness else 0
    if best_idx < len(bgr_list):
        faces = _detect_faces(bgr_list[best_idx])
        if len(faces) > 0:
            largest = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = largest
            rgb_frame = cv2.cvtColor(bgr_list[best_idx], cv2.COLOR_BGR2RGB)
            crop_pil, _ = _crop_with_margin(rgb_frame, x, y, w, h, margin=0.20)
            if crop_pil:
                best_pil_to_embed = crop_pil

    probe_embedding = recognizer.get_embedding(best_pil_to_embed)

    # 1. Direct verification against specific enrolled embedding
    if enrolled_embedding_str:
        try:
            enrolled_embedding = np.array(json.loads(enrolled_embedding_str), dtype=np.float32)
            similarity = cosine_similarity(probe_embedding, enrolled_embedding)
            matched = similarity >= threshold

            return jsonify({
                'matched': bool(matched),
                'similarity': round(float(similarity), 4),
                'threshold': threshold,
                'liveness': liveness_result,
                'embedding': probe_embedding.tolist()
            })
        except Exception as e:
            return jsonify({'error': f"Invalid enrolled embedding: {str(e)}"}), 400

    # 2. Gallery 1:N matching
    if gallery_str:
        try:
            gallery = json.loads(gallery_str)
            match_res = recognizer.recognize(probe_embedding, gallery, threshold=threshold)
            return jsonify({
                **match_res,
                'liveness': liveness_result,
                'embedding': probe_embedding.tolist()
            })
        except Exception as e:
            return jsonify({'error': f"Invalid gallery format: {str(e)}"}), 400

    return jsonify({
        'matched': True,
        'embedding': probe_embedding.tolist(),
        'liveness': liveness_result
    })

@app.route('/batch_verify', methods=['POST'])
def batch_verify():
    """Vectorized batch verification for high-concurrency 10:00 AM claims."""
    try:
        data = json.loads(request.form.get('metadata', '[]'))
        files = request.files.getlist('images')
        threshold = float(request.form.get('threshold', 0.70))

        if len(files) != len(data):
            return jsonify({'error': 'Images count must match metadata items count'}), 400

        pil_list = [pil_from_bytes(f.read()) for f in files]
        enrolled_list = [d['enrolled_embedding'] for d in data]

        results = batch_processor.match_batch(pil_list, enrolled_list, threshold=threshold)
        return jsonify({'batch_results': results, 'total_processed': len(results)})
    except Exception as e:
        return jsonify({'error': f"Batch inference failed: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
