import { useState, useEffect, useRef } from 'react';
import { getComplaints } from '../../services/api';
import './Analytics.css';

const SEV_COLOR = { high: '#E24B4A', medium: '#EF9F27', low: '#378ADD', 'pending review': '#888780' };
const CAT_COLOR = { road_issue: '#E24B4A', pothole: '#E24B4A', waste: '#EF9F27', garbage: '#EF9F27', water: '#378ADD', lighting: '#A855F7', streetlight: '#A855F7' };
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function bar(value, max, color = 'var(--color-text-info)') {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--color-border-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 28, textAlign: 'right' }}>{value}</span>
        </div>
    );
}

export default function Analytics() {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [activeTab, setActiveTab]   = useState('overview'); // 'overview' | 'map'
    const mapRef    = useRef(null);
    const leafletRef = useRef(null); // holds the Leaflet map instance

    useEffect(() => {
        getComplaints()
            .then(res => setComplaints(res.complaints || []))
            .finally(() => setLoading(false));
    }, []);

    // ── Build map when tab switches to 'map' ─────────────────────────────────
    useEffect(() => {
        if (activeTab !== 'map' || !mapRef.current) return;

        // Dynamically load Leaflet if not already loaded
        function initMap() {
            const L = window.L;
            if (!L) return;

            // Destroy previous map instance to avoid "already initialized" error
            if (leafletRef.current) {
                leafletRef.current.remove();
                leafletRef.current = null;
            }

            // Default centre: Pune, India — re-centre if real coordinates exist
            const withCoords = complaints.filter(c => c.latitude && c.longitude);
            const centre = withCoords.length > 0
                ? [
                    withCoords.reduce((s, c) => s + c.latitude,  0) / withCoords.length,
                    withCoords.reduce((s, c) => s + c.longitude, 0) / withCoords.length,
                  ]
                : [18.5204, 73.8567]; // Pune default

            const map = L.map(mapRef.current, { zoomControl: true }).setView(centre, 12);
            leafletRef.current = map;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            // Plot each complaint that has coordinates
            withCoords.forEach(c => {
                const color = SEV_COLOR[c.severity] || '#888780';
                const marker = L.circleMarker([c.latitude, c.longitude], {
                    radius:      c.priorityScore ? Math.max(6, c.priorityScore / 12) : 8,
                    fillColor:   color,
                    color:       color,
                    weight:      1.5,
                    opacity:     0.9,
                    fillOpacity: 0.55,
                }).addTo(map);

                marker.bindPopup(`
                    <div style="font-size:13px;min-width:180px">
                        <strong>${c.incident_id?.slice(0, 12)}…</strong><br/>
                        <span style="text-transform:capitalize">${c.category?.replace('_',' ')}</span>
                        &nbsp;&middot;&nbsp;
                        <span style="font-weight:500;color:${color}">${c.severity}</span><br/>
                        <span style="color:#666">${c.address || 'No address'}</span><br/>
                        <span>Priority: ${c.priorityScore || 'N/A'}</span>
                    </div>
                `);
            });

            // If no real coords, add fake demo markers around Pune for visual
            if (withCoords.length === 0) {
                const demoPoints = [
                    { lat: 18.5204, lng: 73.8567, sev: 'high',   cat: 'pothole',     priority: 82 },
                    { lat: 18.5290, lng: 73.8755, sev: 'medium', cat: 'waste',        priority: 55 },
                    { lat: 18.5120, lng: 73.8400, sev: 'high',   cat: 'water',        priority: 91 },
                    { lat: 18.5350, lng: 73.8620, sev: 'low',    cat: 'streetlight',  priority: 30 },
                    { lat: 18.5180, lng: 73.8700, sev: 'medium', cat: 'pothole',      priority: 60 },
                    { lat: 18.5230, lng: 73.8480, sev: 'high',   cat: 'waste',        priority: 78 },
                    { lat: 18.5400, lng: 73.8300, sev: 'medium', cat: 'water',        priority: 65 },
                    { lat: 18.5060, lng: 73.8600, sev: 'low',    cat: 'pothole',      priority: 25 },
                ];
                demoPoints.forEach(p => {
                    const color = SEV_COLOR[p.sev];
                    L.circleMarker([p.lat, p.lng], {
                        radius: Math.max(6, p.priority / 12),
                        fillColor: color, color, weight: 1.5,
                        opacity: 0.9, fillOpacity: 0.55,
                    }).addTo(map).bindPopup(
                        `<strong>Demo: ${p.cat}</strong><br/>Severity: ${p.sev}<br/>Priority: ${p.priority}`
                    );
                });
            }
        }

        if (window.L) {
            initMap();
        } else {
            // Load Leaflet CSS + JS dynamically
            if (!document.getElementById('leaflet-css')) {
                const link  = document.createElement('link');
                link.id     = 'leaflet-css';
                link.rel    = 'stylesheet';
                link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);
            }
            const script = document.createElement('script');
            script.src   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = initMap;
            document.head.appendChild(script);
        }

        return () => {
            // Cleanup on unmount
            if (leafletRef.current) {
                leafletRef.current.remove();
                leafletRef.current = null;
            }
        };
    }, [activeTab, complaints]);

    // ── Derived stats ─────────────────────────────────────────────────────────
    const total      = complaints.length;
    const resolved   = complaints.filter(c => ['resolved','closed'].includes(c.status)).length;
    const resRate    = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const catCounts = {};
    complaints.forEach(c => { const k = c.category || 'unknown'; catCounts[k] = (catCounts[k] || 0) + 1; });
    const catMax = Math.max(...Object.values(catCounts), 1);

    const sevCounts = { high: 0, medium: 0, low: 0, 'pending review': 0 };
    complaints.forEach(c => { if (sevCounts[c.severity] !== undefined) sevCounts[c.severity]++; });

    // Monthly trend (last 6 months)
    const now = new Date();
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        monthlyMap[key] = { month: key, total: 0, resolved: 0 };
    }
    complaints.forEach(c => {
        const d   = new Date(c.timestamp || c.createdAt);
        const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        if (monthlyMap[key]) {
            monthlyMap[key].total++;
            if (['resolved','closed'].includes(c.status)) monthlyMap[key].resolved++;
        }
    });
    const monthly    = Object.values(monthlyMap);
    const monthlyMax = Math.max(...monthly.map(m => m.total), 1);

    // Dept performance
    const deptMap = {};
    complaints.forEach(c => {
        const d = c.department || 'General';
        if (!deptMap[d]) deptMap[d] = { dept: d, total: 0, resolved: 0 };
        deptMap[d].total++;
        if (['resolved','closed'].includes(c.status)) deptMap[d].resolved++;
    });
    const depts = Object.values(deptMap).sort((a,b) => b.total - a.total).slice(0, 6);

    // Hotspot addresses
    const addrMap = {};
    complaints.forEach(c => {
        if (c.address) {
            const loc = c.address.split(',')[0].trim();
            addrMap[loc] = (addrMap[loc] || 0) + 1;
        }
    });
    const hotspots = Object.entries(addrMap).sort((a,b) => b[1]-a[1]).slice(0, 8);
    const hotMax   = hotspots[0]?.[1] || 1;

    return (
        <div className="analytics-page">
            {/* Tab switcher */}
            <div className="analytics-tabs">
                <button
                    className={`ana-tab ${activeTab === 'overview' ? 'ana-tab-active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >Overview</button>
                <button
                    className={`ana-tab ${activeTab === 'map' ? 'ana-tab-active' : ''}`}
                    onClick={() => setActiveTab('map')}
                >Hotspot map</button>
            </div>

            {loading && <div className="ana-loading">Loading…</div>}

            {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
            {!loading && activeTab === 'overview' && (
                <div className="analytics-grid">

                    {/* Summary KPIs */}
                    <div className="ana-card ana-card-full">
                        <div className="kpi-row">
                            {[
                                { label: 'Total complaints', val: total },
                                { label: 'Resolved', val: resolved },
                                { label: 'Resolution rate', val: `${resRate}%` },
                                { label: 'Unresolved', val: total - resolved },
                            ].map(k => (
                                <div key={k.label} className="kpi-item">
                                    <div className="kpi-val">{k.val}</div>
                                    <div className="kpi-label">{k.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Monthly trend */}
                    <div className="ana-card">
                        <h3 className="ana-card-title">Monthly volume</h3>
                        <div className="bar-chart">
                            {monthly.map(m => (
                                <div key={m.month} className="bar-chart-row">
                                    <span className="bar-label">{m.month}</span>
                                    <div style={{ flex: 1 }}>
                                        {bar(m.total,    monthlyMax, 'var(--color-text-info)')}
                                        {bar(m.resolved, monthlyMax, 'var(--color-text-success)')}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bar-legend">
                            <span className="legend-dot" style={{ background: 'var(--color-text-info)' }} />
                            <span>Total</span>
                            <span className="legend-dot" style={{ background: 'var(--color-text-success)', marginLeft: 12 }} />
                            <span>Resolved</span>
                        </div>
                    </div>

                    {/* Category breakdown */}
                    <div className="ana-card">
                        <h3 className="ana-card-title">By category</h3>
                        {Object.entries(catCounts).sort((a,b) => b[1]-a[1]).map(([cat, cnt]) => (
                            <div key={cat} className="bar-chart-row" style={{ marginBottom: 8 }}>
                                <span className="bar-label" style={{ textTransform: 'capitalize' }}>
                                    {cat.replace('_',' ')}
                                </span>
                                {bar(cnt, catMax, CAT_COLOR[cat] || '#888780')}
                            </div>
                        ))}
                    </div>

                    {/* Severity */}
                    <div className="ana-card">
                        <h3 className="ana-card-title">By severity</h3>
                        {Object.entries(sevCounts).map(([sev, cnt]) => (
                            <div key={sev} className="bar-chart-row" style={{ marginBottom: 8 }}>
                                <span className="bar-label" style={{ textTransform: 'capitalize' }}>{sev}</span>
                                {bar(cnt, Math.max(...Object.values(sevCounts), 1), SEV_COLOR[sev])}
                            </div>
                        ))}
                    </div>

                    {/* Department performance */}
                    <div className="ana-card">
                        <h3 className="ana-card-title">Department performance</h3>
                        <table className="dept-table">
                            <thead>
                                <tr>
                                    <th>Department</th>
                                    <th>Total</th>
                                    <th>Resolved</th>
                                    <th>Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {depts.map(d => (
                                    <tr key={d.dept}>
                                        <td>{d.dept}</td>
                                        <td>{d.total}</td>
                                        <td>{d.resolved}</td>
                                        <td>
                                            <span className={`rate-badge ${d.total > 0 && d.resolved / d.total >= 0.7 ? 'rate-good' : 'rate-low'}`}>
                                                {d.total > 0 ? `${Math.round(d.resolved/d.total*100)}%` : '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Top hotspot addresses */}
                    <div className="ana-card">
                        <h3 className="ana-card-title">Top hotspot areas</h3>
                        {hotspots.length === 0 && <p className="ana-empty">No address data yet</p>}
                        {hotspots.map(([loc, cnt]) => (
                            <div key={loc} className="bar-chart-row" style={{ marginBottom: 8 }}>
                                <span className="bar-label">{loc}</span>
                                {bar(cnt, hotMax, '#D85A30')}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── MAP TAB ───────────────────────────────────────────────────── */}
            {!loading && activeTab === 'map' && (
                <div className="map-tab-wrap">
                    <div className="map-legend">
                        {Object.entries(SEV_COLOR).map(([sev, col]) => (
                            <span key={sev} className="map-legend-item">
                                <span className="map-legend-dot" style={{ background: col }} />
                                {sev}
                            </span>
                        ))}
                        <span className="map-legend-note">Circle size = priority score</span>
                    </div>
                    <div className="map-info-bar">
                        {complaints.filter(c => c.latitude && c.longitude).length} complaints with GPS coordinates plotted
                        {complaints.filter(c => c.latitude && c.longitude).length === 0 && ' (showing demo markers — real data needs GPS on submit)'}
                    </div>
                    <div ref={mapRef} className="leaflet-map-container" />
                </div>
            )}
        </div>
    );
}
