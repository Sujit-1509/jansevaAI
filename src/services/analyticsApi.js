import { getComplaints } from './complaintsApi';
import { mockDashboardStats, mockComplaints } from '../data/mockData';
import { normalizeComplaintList } from './complaintModel';

const ENABLE_MOCK_FALLBACK =
    import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true' || !import.meta.env.PROD;

export async function getSlaBreaches() {
    try {
        const res = await getComplaints();
        const now = Date.now();
        const complaints = res.complaints || [];

        const breached = complaints
            .filter((c) => {
                if (['resolved', 'closed'].includes(c.status)) return false;
                if (!c.sla_deadline) return false;
                return new Date(c.sla_deadline).getTime() < now;
            })
            .map((c) => ({
                ...c,
                hoursOverdue: Math.round((now - new Date(c.sla_deadline).getTime()) / 3600000),
            }))
            .sort((a, b) => b.hoursOverdue - a.hoursOverdue);

        const warning = complaints.filter((c) => {
            if (['resolved', 'closed'].includes(c.status)) return false;
            if (!c.sla_deadline) return false;
            const msLeft = new Date(c.sla_deadline).getTime() - now;
            return msLeft > 0 && msLeft < 6 * 3600 * 1000;
        });

        return { success: true, breached, warning, total: complaints.length };
    } catch (err) {
        console.warn('SLA data failed:', err.message);
        if (ENABLE_MOCK_FALLBACK) return { success: true, breached: [], warning: [], total: 0 };
        throw err;
    }
}

export async function getDashboardStats() {
    try {
        const res = await getComplaints();
        const complaints = res.complaints || [];
        return { success: true, stats: computeStats(complaints) };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('Stats computation failed, using mock:', err.message);
        return { success: true, stats: mockDashboardStats };
    }
}

export async function getWorkerAssignments() {
    try {
        const res = await getComplaints();
        const assignments = (res.complaints || []).filter(
            (c) => c.status === 'assigned' || c.status === 'in_progress'
        );
        return { success: true, assignments };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('API unreachable, using mock worker assignments:', err.message);
        const assignments = normalizeComplaintList(mockComplaints).filter(
            (c) => c.status === 'assigned' || c.status === 'in_progress'
        );
        return { success: true, assignments };
    }
}

function computeStats(complaints) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const total = complaints.length;
    const active = complaints.filter((c) => ['submitted', 'assigned', 'in_progress'].includes(c.status)).length;
    const resolvedAll = complaints.filter((c) => ['resolved', 'closed'].includes(c.status));
    const resolvedToday = resolvedAll.filter((c) => {
        const d = new Date(c.resolvedAt || c.updatedAt || c.timestamp);
        return d >= todayStart;
    }).length;
    const pending = complaints.filter((c) => c.status === 'submitted').length;

    const resolutionRate = total > 0 ? Math.round((resolvedAll.length / total) * 100) : 0;

    const responseTimes = resolvedAll
        .map((c) => {
            const start = new Date(c.timestamp || c.createdAt).getTime();
            const end = new Date(c.resolvedAt || c.updatedAt || c.timestamp).getTime();
            return end > start ? (end - start) / (1000 * 60 * 60 * 24) : 0;
        })
        .filter((d) => d > 0);
    const avgDays = responseTimes.length
        ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
        : '0';
    const avgResponseTime = `${avgDays} days`;

    const withinSLA = responseTimes.filter((d) => d <= 7).length;
    const slaAdherence = responseTimes.length
        ? Math.round((withinSLA / responseTimes.length) * 100)
        : 100;

    const catCounts = {};
    const catColors = {
        road_issue: '#EF4444',
        pothole: '#EF4444',
        waste: '#F59E0B',
        garbage: '#F59E0B',
        water: '#3B82F6',
        lighting: '#A855F7',
        streetlight: '#A855F7',
    };
    complaints.forEach((c) => {
        const cat = c.category || 'unknown';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(catCounts).map(([name, value]) => ({
        name: name.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        color: catColors[name] || '#64748B',
    }));

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        monthlyMap[key] = { month: key, complaints: 0, resolved: 0 };
    }
    complaints.forEach((c) => {
        const d = new Date(c.timestamp || c.createdAt);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        if (monthlyMap[key]) {
            monthlyMap[key].complaints += 1;
            if (['resolved', 'closed'].includes(c.status)) monthlyMap[key].resolved += 1;
        }
    });
    const monthlyTrends = Object.values(monthlyMap);

    const deptMap = {};
    complaints.forEach((c) => {
        const dept = c.department || 'General';
        if (!deptMap[dept]) deptMap[dept] = { dept, resolved: 0, pending: 0 };
        if (['resolved', 'closed'].includes(c.status)) deptMap[dept].resolved += 1;
        else deptMap[dept].pending += 1;
    });
    const departmentPerformance = Object.values(deptMap).sort(
        (a, b) => b.resolved + b.pending - (a.resolved + a.pending)
    );

    const locCounts = {};
    complaints.forEach((c) => {
        if (c.address) {
            const locality = c.address.split(',')[0].trim();
            locCounts[locality] = (locCounts[locality] || 0) + 1;
        }
    });
    const topHotspot = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const nowMs = Date.now();
    const slaBreached = complaints.filter((c) => {
        if (['resolved', 'closed'].includes(c.status)) return false;
        if (!c.sla_deadline) return false;
        return new Date(c.sla_deadline).getTime() < nowMs;
    }).length;

    return {
        totalComplaints: total,
        activeComplaints: active,
        resolvedToday,
        pendingTriage: pending,
        resolutionRate,
        avgResponseTime,
        slaAdherence,
        topHotspot,
        categoryBreakdown,
        monthlyTrends,
        departmentPerformance,
        slaBreached,
    };
}
