import React, { useState } from 'react';
import { Save } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : {
      confidenceThreshold: 0.68,
      livenessDetection: true,
      autoScanInterval: 3
    };
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="container" style={{ maxWidth: '800px' }}>
      <div className="page-header">
        <h1 className="page-title">System Settings</h1>
      </div>

      <div className="card">
        <div className="form-group">
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Recognition Confidence Threshold</span>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>{settings.confidenceThreshold}</span>
          </label>
          <input 
            type="range" 
            min="0.5" 
            max="0.95" 
            step="0.05"
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
            value={settings.confidenceThreshold}
            onChange={(e) => setSettings({...settings, confidenceThreshold: parseFloat(e.target.value)})}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Higher values reduce false positives but may reject valid faces in poor lighting.
          </p>
        </div>

        <div className="form-group" style={{ marginTop: '2rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              style={{ width: '20px', height: '20px', accentColor: 'var(--accent-cyan)' }}
              checked={settings.livenessDetection}
              onChange={(e) => setSettings({...settings, livenessDetection: e.target.checked})}
            />
            <span style={{ fontSize: '1.1rem' }}>Enable Liveness Detection</span>
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginLeft: '2.2rem' }}>
            Requires users to blink or move slightly to prevent photo spoofing.
          </p>
        </div>

        <div className="form-group" style={{ marginTop: '2rem' }}>
          <label>Auto-scan Interval (Continuous Mode)</label>
          <select 
            className="input-field" 
            value={settings.autoScanInterval}
            onChange={(e) => setSettings({...settings, autoScanInterval: parseInt(e.target.value)})}
          >
            <option value={1} style={{ background: 'var(--bg-dark-end)' }}>1 second (High CPU)</option>
            <option value={2} style={{ background: 'var(--bg-dark-end)' }}>2 seconds</option>
            <option value={3} style={{ background: 'var(--bg-dark-end)' }}>3 seconds (Recommended)</option>
            <option value={5} style={{ background: 'var(--bg-dark-end)' }}>5 seconds</option>
          </select>
        </div>

        <div style={{ marginTop: '3rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={20} /> Save Settings
          </button>
          {saved && <span style={{ color: 'var(--accent-emerald)', fontWeight: '500' }}>✓ Settings saved successfully</span>}
        </div>
      </div>
    </div>
  );
}
