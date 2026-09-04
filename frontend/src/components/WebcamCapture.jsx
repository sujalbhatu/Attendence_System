import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Camera, AlertCircle } from 'lucide-react';

const WebcamCapture = forwardRef(({ onCapture, width = '100%', height = 'auto' }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading, active, error

  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus('active');
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setStatus('error');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capture = () => {
    if (status !== 'active' || !videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (onCapture) onCapture(blob);
        resolve(blob);
      }, 'image/jpeg', 0.9);
    });
  };

  const captureBurst = async (count = 8, intervalMs = 65) => {
    if (status !== 'active' || !videoRef.current || !canvasRef.current) return [];

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    
    const blobs = [];
    for (let i = 0; i < count; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b = await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      });
      if (b) blobs.push(b);
      if (i < count - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return blobs;
  };

  useImperativeHandle(ref, () => ({
    capture,
    captureBurst
  }));

  return (
    <div className="webcam-container" style={{ width, height }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark-start)' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(0, 212, 255, 0.3)', borderTop: '4px solid var(--accent-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Accessing camera...</p>
        </div>
      )}
      
      {status === 'error' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark-start)' }}>
          <AlertCircle size={48} color="var(--danger-red)" />
          <p style={{ marginTop: '1rem', color: 'var(--danger-red)' }}>Failed to access camera</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Please ensure permissions are granted.</p>
        </div>
      )}

      <video 
        ref={videoRef} 
        className="webcam-video" 
        autoPlay 
        playsInline 
        muted
        style={{ display: status === 'active' ? 'block' : 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {status === 'active' && (
        <div className="webcam-status">
          <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }}></div>
            LIVE
          </span>
        </div>
      )}
    </div>
  );
});

export default WebcamCapture;
