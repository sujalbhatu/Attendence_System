import React, { useState, useEffect } from 'react';
import { Plus, Crosshair, DoorOpen, MapPin, Archive, AlertCircle } from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { errorText } from '../lib/format';

// Draws the geofence to scale against a fixed 100 m frame, so rooms can be compared at a glance.
function FenceGlyph({ radius }) {
  const r = Math.max(4, Math.min(30, (radius / 100) * 30));
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="30" fill="none" stroke="var(--line-strong)" strokeDasharray="2 3" />
      <circle cx="32" cy="32" r={r} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.25" />
      <circle cx="32" cy="32" r="2" fill="var(--accent)" />
    </svg>
  );
}

function AddClassroomModal({ onClose, onSaved }) {
  const [roomCode, setRoomCode] = useState('');
  const [building, setBuilding] = useState('Main Academic Block');
  const [floor, setFloor] = useState(1);
  const [capacity, setCapacity] = useState(60);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(35);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot read your location.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
      },
      (err) => {
        setError(`Could not get your location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/classrooms', { roomCode, building, floor, capacity, latitude, longitude, radiusMeters });
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save the classroom'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add a classroom"
      description="Stand in the room when you set its location; check-ins are only accepted inside the circle."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-room" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save classroom'}</button>
        </>
      }
    >
      <form id="add-room" onSubmit={submit}>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={16} /><span>{error}</span></div>}
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="rc">Room</label>
            <input id="rc" className="input mono" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="L-302" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="cap">Seats</label>
            <input id="cap" type="number" min="1" className="input" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="bld">Building</label>
            <input id="bld" className="input" value={building} onChange={(e) => setBuilding(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="fl">Floor</label>
            <input id="fl" type="number" className="input" value={floor} onChange={(e) => setFloor(parseInt(e.target.value, 10) || 0)} />
          </div>
        </div>

        <div className="field">
          <div className="label-row">
            <span className="label">Location</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={locate} disabled={locating}>
              <Crosshair size={14} className={locating ? 'spin' : ''} /> {locating ? 'Locating…' : 'Use my location'}
            </button>
          </div>
          <div className="field-row">
            <input className="input mono" aria-label="Latitude" placeholder="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} required />
            <input className="input mono" aria-label="Longitude" placeholder="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} required />
          </div>
          {accuracy != null && <span className="hint">Your phone reported ±{accuracy} m. Indoors this is often 10–30 m; pick a radius larger than that.</span>}
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <div className="label-row">
            <label className="label" htmlFor="rad">Geofence radius</label>
            <span className="mono" style={{ fontSize: '0.85rem' }}>{radiusMeters} m</span>
          </div>
          <input id="rad" type="range" min="15" max="100" step="5" value={radiusMeters} onChange={(e) => setRadiusMeters(parseInt(e.target.value, 10))} />
        </div>
      </form>
    </Modal>
  );
}

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = () =>
    api.get('/classrooms')
      .then((res) => setClassrooms(res.data.classrooms || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const archive = async (c) => {
    if (!window.confirm(`Archive ${c.roomCode}? It will no longer be offered when starting a lecture.`)) return;
    try {
      await api.delete(`/classrooms/${c._id}`);
      load();
    } catch (err) {
      alert(errorText(err, 'Could not archive the classroom'));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Classrooms</div>
          <h1>Rooms and geofences</h1>
          <p>Each room has a centre point and a radius. A phone outside that circle can’t check in, even with a valid code.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add classroom</button>
        </div>
      </div>

      {loading ? (
        <div className="panel loading-line">Loading classrooms…</div>
      ) : classrooms.length === 0 ? (
        <div className="panel empty">
          <DoorOpen size={32} />
          <h3>No classrooms yet</h3>
          <p>Add the rooms you teach in. You’ll pick one each time you start a lecture.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add classroom</button>
        </div>
      ) : (
        <div className="room-grid">
          {classrooms.map((c) => (
            <article key={c._id} className="panel room">
              <div className="room-top">
                <div>
                  <div className="room-code">{c.roomCode}</div>
                  <div className="room-where">{c.building}{c.floor != null ? `, floor ${c.floor}` : ''}</div>
                </div>
                <span className="tag">{c.capacity} seats</span>
              </div>
              <div className="room-fence">
                <FenceGlyph radius={c.radiusMeters} />
                <div className="room-fence-text">
                  <div><span className="mono">{c.radiusMeters} m</span> radius</div>
                  <div className="mono muted" style={{ fontSize: '0.76rem' }}>
                    {Number(c.latitude).toFixed(5)}, {Number(c.longitude).toFixed(5)}
                  </div>
                </div>
              </div>
              <div className="room-foot">
                <a
                  className="btn btn-ghost btn-sm"
                  href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=19/${c.latitude}/${c.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={14} /> View on map
                </a>
                <button className="btn btn-ghost btn-sm" onClick={() => archive(c)}>
                  <Archive size={14} /> Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showAdd && <AddClassroomModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </>
  );
}
