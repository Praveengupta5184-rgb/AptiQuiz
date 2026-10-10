import React from 'react';

/**
 * Pressure Meter visually depicts the room's global performance speed and accuracy.
 * Value 0-100, where 100 is blazing fast and highly accurate (high pressure).
 */
export default function PressureMeter({ value = 50 }) {
    // Normalize value
    const normalized = Math.max(0, Math.min(100, value));
    
    // Determine color stage
    let color = '#3b82f6'; // cool blue
    let label = 'Steady';
    
    if (normalized > 75) {
        color = '#ef4444'; // hot red
        label = 'Intense!';
    } else if (normalized > 50) {
        color = '#f59e0b'; // warning orange
        label = 'Heating Up';
    } else if (normalized < 25) {
        color = '#10b981'; // relaxed green
        label = 'Relaxed';
    }

    return (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#1f2937', borderRadius: '12px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
                <span>Room Pressure</span>
                <span style={{ color }}>{label}</span>
            </div>
            <div style={{ height: '12px', background: '#374151', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ 
                    height: '100%', 
                    width: `${normalized}%`, 
                    background: color,
                    transition: 'width 1s ease-in-out, background 1s ease-in-out'
                }} />
            </div>
        </div>
    );
}
