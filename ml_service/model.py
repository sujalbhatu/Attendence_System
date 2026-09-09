import torch
import torch.nn as nn
import torch.nn.functional as F
from facenet_pytorch import InceptionResnetV1

class FaceEncoder(nn.Module):
    """
    State-of-the-art Face Encoder using InceptionResnetV1 architecture
    pretrained on VGGFace2 (3.3 million human face images).
    Outputs 512-dimensional L2-normalized face embeddings.
    """
    def __init__(self, embedding_size=512, pretrained=True):
        super().__init__()
        self.net = InceptionResnetV1(pretrained='vggface2' if pretrained else None).eval()
    
    def forward(self, x):
        emb = self.net(x)
        emb = F.normalize(emb, p=2, dim=1)
        return emb
