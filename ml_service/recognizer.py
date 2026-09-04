import torch
import torchvision.transforms as transforms
import numpy as np
from PIL import Image
from model import FaceEncoder

def cosine_similarity(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))

class FaceRecognizer:
    def __init__(self, model_path=None, device='cpu'):
        self.device = torch.device(device)
        self.model = FaceEncoder(pretrained=(model_path is None))
        if model_path:
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()
        
        # FaceNet expects 160x160 aligned crops normalized to [-1, 1]
        self.transform = transforms.Compose([
            transforms.Resize((160, 160)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5, 0.5, 0.5],
                                 std=[0.5, 0.5, 0.5])
        ])

    def _preprocess(self, face_image_pil):
        if face_image_pil.mode != 'RGB':
            face_image_pil = face_image_pil.convert('RGB')
        return self.transform(face_image_pil).unsqueeze(0).to(self.device)

    def get_embedding(self, face_image_pil):
        tensor_img = self._preprocess(face_image_pil)
        with torch.no_grad():
            emb = self.model(tensor_img)
        emb_np = emb.cpu().numpy().flatten().astype(np.float32)
        # L2 normalize
        emb_np = emb_np / (np.linalg.norm(emb_np) + 1e-10)
        return emb_np

    def enroll(self, face_images_pil_list):
        if not face_images_pil_list:
            raise ValueError("No images provided for enrollment")
        
        embeddings = []
        for img in face_images_pil_list:
            emb = self.get_embedding(img)
            embeddings.append(emb)
            
        # Centroid averaging across enrollment photos
        avg_emb = np.mean(embeddings, axis=0)
        avg_emb = avg_emb / (np.linalg.norm(avg_emb) + 1e-10)
        return avg_emb.astype(np.float32)

    def recognize(self, probe_embedding, gallery, threshold=0.70):
        best_match = None
        best_score = -1.0
        
        for entry in gallery:
            gallery_emb = entry['embedding']
            score = cosine_similarity(probe_embedding, gallery_emb)
            print(f"[RECOGNIZE] Comparing against {entry.get('name')}: score = {score:.4f}")
            if score > best_score:
                best_score = score
                best_match = entry
                
        print(f"[RECOGNIZE] Best candidate: {best_match.get('name') if best_match else 'None'} with similarity {best_score:.4f} (threshold: {threshold:.4f})")

        if best_match and best_score >= threshold:
            return {
                'matched': True,
                'student_id': best_match.get('id'),
                'student_name': best_match.get('name'),
                'studentId': best_match.get('id'),
                'studentName': best_match.get('name'),
                'confidence': round(float(best_score), 4)
            }
            
        return {
            'matched': False,
            'student_id': best_match.get('id') if best_match else None,
            'student_name': best_match.get('name') if best_match else None,
            'studentId': best_match.get('id') if best_match else None,
            'studentName': best_match.get('name') if best_match else None,
            'confidence': round(float(best_score), 4) if best_score != -1.0 else 0.0
        }
