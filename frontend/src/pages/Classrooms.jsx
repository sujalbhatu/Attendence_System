import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { 
  DoorOpen, 
  Plus, 
  MapPin, 
  CheckCircle2, 
  Trash2, 
  Crosshair, 
  Building,
  ShieldCheck
} from 'lucide-react';

export default function Classrooms() {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [building, setBuilding] = useState('Main Academic Block');
  const [floor, setFloor] = useState(3);
  const [capacity, setCapacity] = useState(80);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState(35);
  const [isGettingGps, setIsGettingGps] = useState(false);

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    try {
      const res = await api.get('/classrooms');
      setClassrooms(res.data.classrooms || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const grabCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported in this browser');
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setIsGettingGps(false);
      },
      (err) => {
        alert('Could not acquire GPS: ' + err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleAddClassroom = async (e) => {
    e.preventDefault();
    try {
      await api.post('/classrooms', {
        roomCode,
        building,
        floor,
        capacity,
        latitude,
        longitude,
        radiusMeters
      });
      setShowModal(false);
      setRoomCode('');
      setLatitude('');
      setLongitude('');
      fetchClassrooms();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create classroom');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to archive this classroom?')) {
      await api.delete(`/classrooms/${id}`);
      fetchClassrooms();
    }
  };

  return (
    <div className="main-content">
      <div className="page-header-row">
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Classroom Geofence Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Configure physical lecture halls, GPS centroids, and geofence boundary radiuses.
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-emerald">
          <Plus size={18} /> Add Classroom
        </button>
      </div>

      {/* Classroom Cards Grid */}
      <div className="classroom-grid">
        {classrooms.map((c) => (
          <div key={c._id} className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  {c.roomCode}
                </span>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {c.building} (Floor {c.floor})
                </div>
              </div>
              <span className="badge badge-emerald">Cap: {c.capacity}</span>
            </div>

            <div style={{ 
              background: 'var(--bg-main)', 
              padding: '0.85rem', 
              borderRadius: '10px', 
              border: '1px solid var(--border-subtle)',
              fontSize: '0.825rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={15} color="var(--accent-emerald)" />
                <span>Centroid: <strong>{c.latitude?.toFixed(5)}, {c.longitude?.toFixed(5)}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={15} color="var(--accent-cyan)" />
                <span>Geofence Boundary: <strong>{c.radiusMeters} meters</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
              <button onClick={() => handleDelete(c._id)} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
                <Trash2 size={14} color="var(--accent-red)" /> Archive
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="card modal-card">
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1rem' }}>Configure Classroom</h2>
            <form onSubmit={handleAddClassroom}>
              <div className="form-group">
                <label className="form-label">Room Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. L-302" 
                  value={roomCode} 
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="form-input mono" 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Building / Block</label>
                <input 
                  type="text" 
                  value={building} 
                  onChange={(e) => setBuilding(e.target.value)}
                  className="form-input" 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Floor</label>
                  <input 
                    type="number" 
                    value={floor} 
                    onChange={(e) => setFloor(parseInt(e.target.value))}
                    className="form-input" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input 
                    type="number" 
                    value={capacity} 
                    onChange={(e) => setCapacity(parseInt(e.target.value))}
                    className="form-input" 
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Centroid Coordinates</label>
                  <button type="button" onClick={grabCurrentLocation} className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                    <Crosshair size={13} className={isGettingGps ? 'spin' : ''} /> Grab My Location
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Latitude" 
                    value={latitude} 
                    onChange={(e) => setLatitude(e.target.value)}
                    className="form-input mono" 
                    required 
                  />
                  <input 
                    type="text" 
                    placeholder="Longitude" 
                    value={longitude} 
                    onChange={(e) => setLongitude(e.target.value)}
                    className="form-input mono" 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Geofence Radius: {radiusMeters} meters</label>
                <input 
                  type="range" 
                  min="15" 
                  max="80" 
                  step="5" 
                  value={radiusMeters} 
                  onChange={(e) => setRadiusMeters(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-emerald" style={{ flex: 1 }}>
                  Save Classroom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
