import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Volume2, 
  VolumeX, 
  Activity, 
  Play, 
  Square, 
  RefreshCw, 
  CheckCircle2, 
  Bell,
  Laptop,
  Smartphone,
  ShieldCheck,
  Zap,
  Layers
} from 'lucide-react';
import { UltrasonicTransmitter, UltrasonicReceiver, FREQ_CONFIG } from '../services/ultrasonicModem';

export default function UltrasonicLab() {
  const [mode, setMode] = useState('audible');
  
  // Transmitter states
  const [token, setToken] = useState('A3ED');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [volume, setVolume] = useState(0.95);
  const [txProgress, setTxProgress] = useState({ step: 'idle', char: '', freq: 0 });
  const transmitterRef = useRef(null);

  // Receiver states
  const [isListening, setIsListening] = useState(false);
  const [rxError, setRxError] = useState(null);
  const [rxMetrics, setRxMetrics] = useState({ peakFreq: 0, peakEnergy: 0, noiseFloor: 0, snr: 0, micInputLevel: 0, state: 'IDLE', statusText: 'Offline', buffer: '' });
  const [sensitivity, setSensitivity] = useState(30);
  const [verifiedTokens, setVerifiedTokens] = useState([]);
  const receiverRef = useRef(null);
  const canvasRef = useRef(null);

  const generateNewToken = () => {
    const chars = '0123456789ABCDEF';
    let res = '';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setToken(res);
  };

  useEffect(() => {
    transmitterRef.current = new UltrasonicTransmitter(mode);
    transmitterRef.current.setVolume(volume);

    receiverRef.current = new UltrasonicReceiver(mode);
    receiverRef.current.setSensitivity(sensitivity, 10);

    return () => {
      if (transmitterRef.current) transmitterRef.current.destroy();
      if (receiverRef.current) receiverRef.current.stopListening();
    };
  }, []);

  useEffect(() => {
    if (transmitterRef.current) transmitterRef.current.setMode(mode);
    if (receiverRef.current) receiverRef.current.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (transmitterRef.current) transmitterRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (receiverRef.current) receiverRef.current.setSensitivity(sensitivity, 10);
  }, [sensitivity]);

  const handleTestBeep = async () => {
    if (!transmitterRef.current) return;
    await transmitterRef.current.playTestBeep(1000, 350);
  };

  const handleTransmitOnce = async () => {
    if (!transmitterRef.current) return;
    await transmitterRef.current.transmitToken(token, (prog) => {
      setTxProgress(prog);
    });
  };

  const handleToggleBroadcast = () => {
    if (!transmitterRef.current) return;
    if (isBroadcasting) {
      transmitterRef.current.stopContinuousBroadcast();
      setIsBroadcasting(false);
      setTxProgress({ step: 'idle', char: '', freq: 0 });
    } else {
      setIsBroadcasting(true);
      transmitterRef.current.startContinuousBroadcast(token, 2800, (prog) => {
        setTxProgress(prog);
      });
    }
  };

  const handleToggleListen = async () => {
    if (!receiverRef.current) return;
    setRxError(null);

    if (isListening) {
      receiverRef.current.stopListening();
      setIsListening(false);
    } else {
      try {
        await receiverRef.current.startListening(
          (packet) => {
            setVerifiedTokens((prev) => [
              { ...packet, id: Date.now() + Math.random(), matched: packet.token === token },
              ...prev.slice(0, 9)
            ]);
          },
          (spectrum) => {
            setRxMetrics({
              peakFreq: spectrum.peakFreq,
              peakEnergy: Math.round(spectrum.peakEnergy),
              noiseFloor: Math.round(spectrum.noiseFloor),
              snr: Math.round(spectrum.snr),
              micInputLevel: spectrum.micInputLevel,
              state: spectrum.state,
              statusText: spectrum.statusText,
              buffer: spectrum.buffer
            });

            drawSpectrum(spectrum);
          }
        );
        setIsListening(true);
      } catch (err) {
        setRxError(err.message);
      }
    }
  };

  const drawSpectrum = (spectrum) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const { dataArray, sampleRate, fftSize } = spectrum;
    const bufferLength = dataArray.length;
    const binWidth = sampleRate / fftSize;

    const conf = FREQ_CONFIG[mode];
    const startFreq = conf.minSearch - 200;
    const endFreq = conf.maxSearch + 200;

    const startBin = Math.floor(startFreq / binWidth);
    const endBin = Math.min(Math.ceil(endFreq / binWidth), bufferLength - 1);
    const numBins = Math.max(1, endBin - startBin);

    // Active band window
    const windowX1 = ((conf.minSearch - startFreq) / (endFreq - startFreq)) * width;
    const windowX2 = ((conf.maxSearch - startFreq) / (endFreq - startFreq)) * width;

    ctx.fillStyle = 'rgba(0, 212, 255, 0.08)';
    ctx.fillRect(windowX1, 0, windowX2 - windowX1, height);

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.25)';
    ctx.strokeRect(windowX1, 0, windowX2 - windowX1, height);

    // Bars
    const barWidth = Math.max(1, width / numBins);
    for (let i = 0; i < numBins; i++) {
      const binIdx = startBin + i;
      const energy = dataArray[binIdx];
      const barHeight = (energy / 255) * (height - 24);
      const x = i * barWidth;
      const y = height - barHeight;

      const currentFreq = binIdx * binWidth;
      const isPeak = Math.abs(currentFreq - spectrum.peakFreq) < (binWidth * 1.5);

      if (isPeak && energy > sensitivity) {
        ctx.fillStyle = '#00e68a';
      } else if (currentFreq >= conf.minSearch && currentFreq <= conf.maxSearch) {
        ctx.fillStyle = '#00d4ff';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      }

      ctx.fillRect(x, y, barWidth - 0.5, barHeight);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter, monospace';
    ctx.fillText(`${(startFreq / 1000).toFixed(1)} kHz`, 8, height - 6);
    ctx.fillText(`${(endFreq / 1000).toFixed(1)} kHz`, width - 50, height - 6);
    ctx.fillText(`Band: ${conf.minSearch}Hz - ${conf.maxSearch}Hz`, width / 2 - 80, 16);
  };

  return (
    <div className="container" style={{ paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <Radio size={28} color="var(--accent-cyan)" />
            <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>Ultrasonic Proximity Watermarking Lab</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Clock-Synchronized Time-Slotted FSK modem over Web Audio API.
          </p>
        </div>

        {/* 3 Frequency Bands */}
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--glass-bg)', padding: '0.35rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <button
            onClick={() => setMode('audible')}
            className={`btn ${mode === 'audible' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
          >
            <Volume2 size={15} /> Audible (2 kHz)
          </button>
          <button
            onClick={() => setMode('nearUltra')}
            className={`btn ${mode === 'nearUltra' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
          >
            <Zap size={15} /> Near-Ultrasound (16 kHz)
          </button>
          <button
            onClick={() => setMode('ultrasonic')}
            className={`btn ${mode === 'ultrasonic' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
          >
            <VolumeX size={15} /> Full Ultra (18 kHz)
          </button>
        </div>
      </div>

      {/* Mode Banner */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-cyan)', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <strong>Active Band: {FREQ_CONFIG[mode].name}</strong>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
              {mode === 'audible' && 'Audible tones. Best for initial test to confirm laptop speaker -> phone mic loop.'}
              {mode === 'nearUltra' && '15.5 - 16.8 kHz. Inaudible to adult humans, supported by 99% of laptop speakers and phone microphones!'}
              {mode === 'ultrasonic' && '17.5 - 19.0 kHz. Completely silent. Requires high-fidelity phone microphone and laptop speakers.'}
            </p>
          </div>
          <button onClick={handleTestBeep} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <Bell size={15} /> 1 kHz Test Beep
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* TRANSMITTER CARD */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Laptop size={18} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Transmitter (Teacher Laptop)</h2>
            </div>
            <span className={`badge ${isBroadcasting ? 'badge-primary' : 'badge-secondary'}`}>
              {isBroadcasting ? 'Broadcasting' : 'Standby'}
            </span>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Token to Transmit (4 Hex Digits)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                maxLength={4}
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)',
                  padding: '0.65rem 1rem',
                  borderRadius: '8px',
                  fontFamily: 'monospace',
                  fontSize: '1.25rem',
                  letterSpacing: '4px',
                  fontWeight: 700,
                  textAlign: 'center'
                }}
              />
              <button onClick={generateNewToken} className="btn btn-secondary" title="Random Token">
                <RefreshCw size={17} />
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              <span>Speaker Output Volume</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.2" 
              max="1.0" 
              step="0.05" 
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* Active Tone Visualizer */}
          <div style={{ 
            background: 'rgba(0,0,0,0.35)', 
            padding: '0.85rem', 
            borderRadius: '10px', 
            border: '1px solid var(--glass-border)',
            minHeight: '80px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {txProgress.step !== 'idle' ? (
              <>
                <div style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Broadcasting [{txProgress.char}]
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>
                  {txProgress.freq} Hz
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '0.4rem', overflow: 'hidden' }}>
                  <div style={{ width: `${(txProgress.index / (txProgress.total || 4)) * 100}%`, height: '100%', background: 'var(--accent-emerald)', transition: 'width 0.1s linear' }} />
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Transmitter standby</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button 
              onClick={handleToggleBroadcast} 
              className={`btn ${isBroadcasting ? 'btn-danger' : 'btn-primary'}`} 
              style={{ flex: 1, padding: '0.75rem' }}
            >
              {isBroadcasting ? <><Square size={17} /> Stop Loop</> : <><Play size={17} /> Auto-Broadcast Loop</>}
            </button>
            <button 
              onClick={handleTransmitOnce} 
              disabled={isBroadcasting || txProgress.step !== 'idle'}
              className="btn btn-secondary" 
              style={{ padding: '0.75rem 1.1rem' }}
            >
              Send 1x
            </button>
          </div>
        </div>

        {/* RECEIVER CARD */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone size={18} color="var(--accent-emerald)" />
              <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Receiver (Student Phone)</h2>
            </div>
            <span className={`badge ${isListening ? (rxMetrics.state === 'SAMPLING' ? 'badge-primary' : 'badge-success') : 'badge-secondary'}`}>
              {isListening ? (rxMetrics.state === 'SAMPLING' ? 'Decoding...' : 'Listening') : 'Offline'}
            </span>
          </div>

          {rxError && (
            <div style={{ background: 'rgba(255, 71, 87, 0.15)', border: '1px solid var(--danger-red)', padding: '0.65rem', borderRadius: '8px', color: 'var(--danger-red)', fontSize: '0.82rem' }}>
              {rxError}
            </div>
          )}

          {/* Live FFT Canvas */}
          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
            <canvas ref={canvasRef} width={460} height={130} style={{ display: 'block', width: '100%', height: '130px' }} />
            {!isListening && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(10, 10, 15, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Microphone inactive</span>
              </div>
            )}
          </div>

          {/* Real-time Status & Slot Tracker */}
          <div style={{ 
            background: 'rgba(0,0,0,0.3)', 
            padding: '0.75rem 1rem', 
            borderRadius: '8px', 
            border: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>FSM Status</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: rxMetrics.state === 'SAMPLING' ? 'var(--accent-emerald)' : 'var(--accent-cyan)' }}>
                {isListening ? rxMetrics.statusText : 'Offline'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Slot Buffer</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--accent-emerald)' }}>
                {rxMetrics.buffer || '----'}
              </div>
            </div>
          </div>

          {/* Mic Level & Sensitivity Controls */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              <span>Live Mic Activity</span>
              <span>{isListening ? `${rxMetrics.micInputLevel}%` : 'Off'}</span>
            </div>
            <div style={{ width: '100%', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${rxMetrics.micInputLevel}%`, height: '100%', background: rxMetrics.micInputLevel > 50 ? 'var(--warning-amber)' : 'var(--accent-emerald)', transition: 'width 0.05s ease' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.65rem', marginBottom: '0.25rem' }}>
              <span>Sensitivity Threshold</span>
              <span>{sensitivity} / 255</span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="70" 
              step="5" 
              value={sensitivity}
              onChange={(e) => setSensitivity(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-emerald)' }}
            />
          </div>

          {/* Receiver Action */}
          <button 
            onClick={handleToggleListen} 
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
            style={{ width: '100%', padding: '0.75rem' }}
          >
            {isListening ? <><Square size={17} /> Stop Listening</> : <><Activity size={17} /> Start Microphone Listening</>}
          </button>
        </div>

      </div>

      {/* Verified Packets Log */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={19} color="var(--accent-emerald)" />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Decoded Physical Presence Tokens</h3>
          </div>
          {verifiedTokens.length > 0 && (
            <button onClick={() => setVerifiedTokens([])} className="btn btn-secondary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.72rem' }}>
              Clear Log
            </button>
          )}
        </div>

        {verifiedTokens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-secondary)' }}>
            <Radio size={32} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No tokens decoded yet.</p>
            <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.7 }}>
              Start listening on phone, then hit Send on laptop!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {verifiedTokens.map((p) => (
              <div 
                key={p.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.9rem',
                  borderRadius: '8px',
                  background: p.matched ? 'rgba(0, 230, 138, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${p.matched ? 'rgba(0, 230, 138, 0.3)' : 'var(--glass-border)'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <CheckCircle2 size={18} color="var(--accent-emerald)" />
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--accent-cyan)' }}>
                      {p.token}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.65rem' }}>
                      {p.matched ? '✓ Exact Teacher Token Match' : '✓ Valid Packet Decoded'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Proximity Proved</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {p.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
