import { Construction, Lightbulb, Trash2, Droplets, Building, Trees } from 'lucide-react';
import { STATUS_CONFIG, SEVERITY_CONFIG, CATEGORIES } from '../../data/mockData';
import './Shared.css';
const CATEGORY_ICONS = {
    construction: Construction,
    lightbulb: Lightbulb,
    'trash-2': Trash2,
    droplets: Droplets,
    building: Building,
    trees: Trees,
};
export const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status];
    if (!config) return null;
    return <span className={`badge ${config.class}`}>{config.label}</span>;
};
export const SeverityBadge = ({ severity }) => {
    const config = SEVERITY_CONFIG[severity];
    if (!config) return null;
    return <span className={`badge ${config.class}`}>{config.label}</span>;
};
export const CategoryTag = ({ category }) => {
    const cat = CATEGORIES[category];
    if (!cat) return null;
    const Icon = CATEGORY_ICONS[cat.iconName];
    return (
        <span className="category-tag" style={{ '--cat-color': cat.color }}>
            {Icon && <Icon size={12} />} {cat.label}
        </span>
    );
};
export const StatsCard = ({ icon, label, value, change, changeType }) => (
    <div className="stats-card card card-glow">
        <div className="stats-card-icon">{icon}</div>
        <div className="stats-card-info">
            <span className="stats-card-value">{value}</span>
            <span className="stats-card-label">{label}</span>
        </div>
        {change && (
            <span className={`stats-change ${changeType === 'up' ? 'positive' : 'negative'}`}>
                {changeType === 'up' ? '↑' : '↓'} {change}
            </span>
        )}
    </div>
);
export const Loader = ({ size = 'md', text }) => (
    <div className={`loader-wrapper loader-${size}`}>
        <div className="loader-spinner" />
        {text && <p className="loader-text">{text}</p>}
    </div>
);
export const EmptyState = ({ icon, title, description, action }) => (
    <div className="empty-state">
        <div className="empty-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
    </div>
);
export const PriorityBar = ({ score }) => {
    const getColor = () => {
        if (score >= 80) return 'var(--severity-critical)';
        if (score >= 60) return 'var(--severity-high)';
        if (score >= 40) return 'var(--severity-medium)';
        return 'var(--severity-low)';
    };
    return (
        <div className="priority-bar-wrapper">
            <div className="priority-bar">
                <div
                    className="priority-bar-fill"
                    style={{ width: `${score}%`, background: getColor() }}
                />
            </div>
            <span className="priority-score" style={{ color: getColor() }}>
                {score}
            </span>
        </div>
    );
};
export const TimeAgo = ({ date }) => {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    let text;
    if (diffMins < 60) text = `${diffMins}m ago`;
    else if (diffHours < 24) text = `${diffHours}h ago`;
    else text = `${diffDays}d ago`;
    return <span className="time-ago">{text}</span>;
};
