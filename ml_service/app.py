from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
from werkzeug.utils import secure_filename
import base64
import numpy as np
import io
import json
import cv2
from PIL import Image

from face_detector import detect_and_crop_from_bytes
from recognizer import FaceRecognizer
from liveness import check_passive_liveness, check_temporal_liveness, verify_blink_burst

app = Flask(__name__)
CORS(app)

# Keep model in memory
print("Loading FaceRecognizer...")
recognizer = FaceRecognizer(device='cpu')
print("FaceRecognizer loaded successfully.")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model_loaded': True})

@app.route('/detect', methods=['POST'])
def detect():
    try:
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image provided'})
        
        file = request.files['image']
        image_bytes = file.read()
        
        cropped_pil, bbox = detect_and_crop_from_bytes(image_bytes)
        
        if cropped_pil is None:
            return jsonify({'success': True, 'face_detected': False, 'bbox': None})
            
        buffered = io.BytesIO()
        cropped_pil.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return jsonify({
            'success': True,
            'face_detected': True,
            'bbox': bbox,
            'cropped_image': img_str
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/embed', methods=['POST'])
def embed():
    try:
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image provided'})
            
        file = request.files['image']
        image_bytes = file.read()
        
        cropped_pil, _ = detect_and_crop_from_bytes(image_bytes)
        if cropped_pil is None:
            return jsonify({'success': False, 'error': 'No face detected'})
            
        emb = recognizer.get_embedding(cropped_pil)
        emb_b64 = base64.b64encode(emb.astype(np.float32).tobytes()).decode('utf-8')
        
        return jsonify({'success': True, 'embedding': emb_b64})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/enroll', methods=['POST'])
def enroll():
    try:
        files = request.files.getlist('images')
        user_id = request.form.get('userId')
        
        if not files:
            return jsonify({'success': False, 'error': 'No images provided'})
            
        faces = []
        for file in files:
            image_bytes = file.read()
            cropped_pil, _ = detect_and_crop_from_bytes(image_bytes)
            if cropped_pil is not None:
                faces.append(cropped_pil)
                
        if not faces:
            return jsonify({'success': False, 'error': 'No faces detected in any image'})
            
        avg_emb = recognizer.enroll(faces)
        emb_b64 = base64.b64encode(avg_emb.astype(np.float32).tobytes()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'embedding': emb_b64,
            'photoCount': len(faces),
            'userId': user_id
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/recognize', methods=['POST'])
def recognize():
    try:
        if 'gallery' not in request.form:
            return jsonify({'success': False, 'error': 'No gallery provided'})
            
        threshold = float(request.form.get('threshold', 0.70))
        check_liveness_flag = request.form.get('liveness', 'false').lower() == 'true'
        mode = request.form.get('mode', 'standard')
        
        gallery_json = json.loads(request.form['gallery'])
        gallery = []
        for entry in gallery_json:
            emb_bytes = base64.b64decode(entry['embedding'])
            emb_np = np.frombuffer(emb_bytes, dtype=np.float32)
            gallery.append({
                'id': entry.get('id'),
                'name': entry.get('name'),
                'embedding': emb_np
            })

        # --- ACTIVE BLINK BURST MODE ---
        burst_files = request.files.getlist('images')
        if mode == 'blink' and len(burst_files) >= 2:
            face_pils = []
            face_bgrs = []
            for bf in burst_files:
                cpil, _ = detect_and_crop_from_bytes(bf.read())
                if cpil is not None:
                    face_pils.append(cpil)
                    face_bgrs.append(cv2.cvtColor(np.array(cpil), cv2.COLOR_RGB2BGR))
                    
            if len(face_pils) < 2:
                return jsonify({
                    'success': True,
                    'matched': False,
                    'spoof_detected': True,
                    'reason': 'Could not detect face in all burst frames. Please face the camera steadily.'
                })
                
            blink_res = verify_blink_burst(face_bgrs)
            if not blink_res['is_live']:
                return jsonify({
                    'success': True,
                    'matched': False,
                    'spoof_detected': True,
                    'reason': blink_res['reason'],
                    'confidence': 0.0
                })
                
            # Pick best open-eye frame for FaceNet matching
            best_pil = face_pils[blink_res['best_frame_idx']]
            probe_emb = recognizer.get_embedding(best_pil)
            result = recognizer.recognize(probe_emb, gallery, threshold=threshold)
            result['success'] = True
            result['spoof_detected'] = False
            result['blink_verified'] = True
            return jsonify(result)

        # --- STANDARD / TEMPORAL MODE ---
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image provided'})
            
        file = request.files['image']
        image_bytes = file.read()
        
        cropped_pil, _ = detect_and_crop_from_bytes(image_bytes)
        if cropped_pil is None:
            return jsonify({'success': False, 'error': 'No face detected in probe image'})

        # Liveness check
        if check_liveness_flag:
            face_np = np.array(cropped_pil)
            face_bgr = cv2.cvtColor(face_np, cv2.COLOR_RGB2BGR)
            liveness_result = check_passive_liveness(face_bgr)
            
            if 'image2' in request.files:
                file2 = request.files['image2']
                bytes2 = file2.read()
                crop2_pil, _ = detect_and_crop_from_bytes(bytes2)
                if crop2_pil is not None:
                    crop2_bgr = cv2.cvtColor(np.array(crop2_pil), cv2.COLOR_RGB2BGR)
                    temporal_res = check_temporal_liveness(face_bgr, crop2_bgr)
                    if not temporal_res['is_live']:
                        liveness_result['is_live'] = False
                        liveness_result['reason'] = temporal_res['reason']
            
            if not liveness_result['is_live']:
                print(f"[SPOOF DETECTED] {liveness_result['reason']}")
                return jsonify({
                    'success': True,
                    'matched': False,
                    'spoof_detected': True,
                    'reason': liveness_result['reason'],
                    'confidence': 0.0
                })
            
        probe_emb = recognizer.get_embedding(cropped_pil)
        result = recognizer.recognize(probe_emb, gallery, threshold=threshold)
        result['success'] = True
        result['spoof_detected'] = False
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
