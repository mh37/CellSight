/* eslint-disable @typescript-eslint/no-explicit-any */
import { Shield, Tag, Activity } from 'lucide-react';


export default function LocationsTab(props: any) {
  const {
    locations,
    selectedLocation,
    setSelectedLocation,
    handleToggleEvidence,
    locationsHasMore,
    fetchLocations,
    locationsOffset
  } = props;

const renderOfflineMap = () => {
    if (locations.length === 0) {
      return (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          No coordinate logs extracted to plot.
        </div>
      );
    }

    const lats = locations.map((l: any) => l.latitude);
    const lons = locations.map((l: any) => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latRange = maxLat - minLat || 0.001;
    const lonRange = maxLon - minLon || 0.001;

    const width = 800;
    const height = 460;
    const padding = 60;

    const getXY = (lat: number, lon: number) => {
      const x = padding + ((lon - minLon) / lonRange) * (width - 2 * padding);
      const y = height - padding - ((lat - minLat) / latRange) * (height - 2 * padding);
      return { x, y };
    };

    // Build SVG path
    let pathD = "";
    locations.forEach((loc: any, idx: number) => {
      const { x, y } = getXY(loc.latitude, loc.longitude);
      if (idx === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
    });

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0e1a', display: 'flex', flexDirection: 'column' }}>
        {/* Security alert header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Offline Coordinate Track Plotter</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '12px' }}>
            <Shield size={12} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 'bold', textTransform: 'uppercase' }}>OFFLINE PRIVATE PLOT</span>
          </div>
        </div>

        <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 800 460" style={{ background: '#070a13' }}>
            {/* Compass grid lines */}
            <line x1="0" y1="230" x2="800" y2="230" stroke="rgba(255,255,255,0.03)" strokeDasharray="5,5" />
            <line x1="400" y1="0" x2="400" y2="460" stroke="rgba(255,255,255,0.03)" strokeDasharray="5,5" />

            {/* Movement Path */}
            {locations.length > 1 && (
              <path
                d={pathD}
                fill="none"
                stroke="url(#trail-gradient)"
                strokeWidth="3"
                strokeDasharray="8,4"
              />
            )}

            {/* Definitions for gradients */}
            <defs>
              <linearGradient id="trail-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-cyan)" />
                <stop offset="100%" stopColor="var(--accent-indigo)" />
              </linearGradient>
              <radialGradient id="selected-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Coordinate points */}
            {locations.map((loc: any, idx: number) => {
              const { x, y } = getXY(loc.latitude, loc.longitude);
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <g key={loc.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLocation(loc)}>
                  {isSelected && (
                    <circle cx={x} cy={y} r="20" fill="url(#selected-glow)" />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? "7" : "5"}
                    fill={isSelected ? "var(--accent-cyan)" : "var(--bg-tertiary)"}
                    stroke={isSelected ? "#fff" : "var(--accent-indigo)"}
                    strokeWidth="2"
                  />
                  {/* Labels for points */}
                  <text
                    x={x + 10}
                    y={y - 6}
                    fill={isSelected ? "var(--accent-cyan)" : "var(--text-muted)"}
                    fontSize={isSelected ? "11px" : "9px"}
                    fontWeight={isSelected ? "bold" : "normal"}
                    style={{ pointerEvents: 'none' }}
                  >
                    Point {idx + 1}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Selected Point overlay card inside container */}
          {selectedLocation && (
            <div className="glass-card" style={{ position: 'absolute', bottom: '15px', left: '15px', right: '15px', padding: '14px', background: 'rgba(9, 13, 22, 0.9)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 'bold' }}>{selectedLocation.address || 'GPS Coordinate Log'}</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Lat: {selectedLocation.latitude} | Lon: {selectedLocation.longitude} (Accuracy: {selectedLocation.accuracy ? `${selectedLocation.accuracy}m` : 'N/A'})
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleToggleEvidence('location', selectedLocation.id, selectedLocation.is_evidence, `Location: ${selectedLocation.latitude}, ${selectedLocation.longitude}`)}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    <Tag size={10} style={{ color: selectedLocation.is_evidence ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                    {selectedLocation.is_evidence ? 'Unflag' : 'Flag Evidence'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
              {/* Coordinates List */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '550px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Geotag logs</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
                  {locations.map((loc: any) => {
                    const isPinned = loc.is_evidence;
                    return (
                      <button
                        key={loc.id}
                        onClick={() => setSelectedLocation(loc)}
                        style={{
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          background: selectedLocation?.id === loc.id ? 'rgba(0,242,254,0.06)' : 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          borderLeft: selectedLocation?.id === loc.id ? '3px solid var(--accent-cyan)' : '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(loc.timestamp).toLocaleString()}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isPinned && <Tag size={10} style={{ color: 'var(--color-warning)' }} />}
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>{loc.source}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{loc.address || 'GPS Coordinates'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {loc.latitude}, {loc.longitude}
                        </div>
                      </button>
                    );
                  })}
                  {locationsHasMore && (
                    <button onClick={() => fetchLocations(locationsOffset)} className="btn-secondary"
                      style={{ fontSize: '11px', justifyContent: 'center', marginTop: '8px' }}>
                      Load More Locations
                    </button>
                  )}
                </div>
              </div>

              {/* Map embed iframe */}
              <div className="map-container">
                {renderOfflineMap()}
              </div>
            </div>
  );
}
