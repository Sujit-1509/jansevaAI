import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, MapPin, Zap, Shield, TrendingUp, Cpu, Send, BarChart3, ArrowRight } from 'lucide-react';
import { getNearbyComplaints } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, TimeAgo } from '../../components/Shared/Shared';
import heroImage from '../../assets/hero-image.png';
import './Home.css';
const Home = () => {
    const [nearby, setNearby] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        getNearbyComplaints(18.52, 73.85).then((res) => {
            setNearby(res.complaints);
            setLoading(false);
        });
    }, []);
    return (
        <div className="home-page">
            <section className="hero">
                <div className="container">
                    <div className="hero-inner">
                        <div className="hero-text animate-fade-in">
                            <div className="hero-badge">
                                <img
                                    src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
                                    alt="Emblem"
                                    className="hero-badge-emblem"
                                />
                                Government of India Initiative
                            </div>
                            <h1>JanSevaAI<br />Municipal Solutions</h1>
                            <p className="hero-desc">
                                Report civic issues in your city — potholes, garbage, broken streetlights, and more.
                                Our AI-powered system automatically detects, categorizes, and routes complaints
                                to the right municipal department for faster resolution.
                            </p>
                            <div className="hero-actions">
                                <Link to="/submit" className="btn btn-primary btn-lg">
                                    <Camera size={16} /> Report an Issue
                                </Link>
                                <Link to="/my-complaints" className="btn btn-outline btn-lg">
                                    Track My Complaints <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>
                        <div className="hero-image animate-fade-in">
                            <img
                                src={heroImage}
                                alt="Pune Smart City"
                                className="hero-img"
                                onError={(e) => {
                                    e.target.src = 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=600&h=400&fit=crop';
                                }}
                            />
                        </div>
                    </div>
                    <div className="hero-stats animate-fade-in">
                        <div className="hero-stat">
                            <span className="hero-stat-value">1,247</span>
                            <span className="hero-stat-label">Issues Reported</span>
                        </div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">75%</span>
                            <span className="hero-stat-label">Resolved</span>
                        </div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">2.3 days</span>
                            <span className="hero-stat-label">Avg Response</span>
                        </div>
                        <div className="hero-stat">
                            <span className="hero-stat-value">12</span>
                            <span className="hero-stat-label">Departments</span>
                        </div>
                    </div>
                </div>
            </section>
            <section className="how-section">
                <div className="container">
                    <div className="section-header">
                        <h2>How It Works</h2>
                        <p>Three simple steps from photo to resolution</p>
                    </div>
                    <div className="steps-grid">
                        {[
                            { icon: <Camera size={24} />, num: '01', title: 'Upload Photo', desc: 'Take or upload a photo of the civic issue. Your GPS location is automatically captured.' },
                            { icon: <Cpu size={24} />, num: '02', title: 'AI Analyzes', desc: 'Our AI detects the issue type, assesses severity, and generates a structured complaint.' },
                            { icon: <Send size={24} />, num: '03', title: 'Auto-Routed', desc: 'Complaint is scored, prioritized, and routed to the correct municipal department.' },
                        ].map((s, i) => (
                            <div key={i} className="step-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className="step-num">{s.num}</div>
                                <div className="step-icon">{s.icon}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="features-section">
                <div className="container">
                    <div className="section-header">
                        <h2>Platform Features</h2>
                        <p>Built for Indian cities, powered by advanced AI</p>
                    </div>
                    <div className="features-grid">
                        {[
                            { icon: <Cpu size={20} />, title: 'AI Vision Detection', desc: '92%+ accuracy in detecting potholes, garbage, broken streetlights, and more' },
                            { icon: <MapPin size={20} />, title: 'GPS Auto-Detect', desc: 'Precise location tagging with automatic ward and sector mapping' },
                            { icon: <Zap size={20} />, title: 'Priority Scoring', desc: 'Dynamic 0-100 scoring based on severity, location, and community votes' },
                            { icon: <Send size={20} />, title: 'Smart Routing', desc: 'Automatic department assignment — PWD, Sanitation, Electrical, Water Supply' },
                            { icon: <BarChart3 size={20} />, title: 'Live Dashboard', desc: 'Real-time analytics for municipal administrators and department heads' },
                            { icon: <Shield size={20} />, title: 'Secure & Reliable', desc: 'Government-grade infrastructure with end-to-end data encryption' },
                        ].map((f, i) => (
                            <div key={i} className="feature-card animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                                <div className="feature-icon">{f.icon}</div>
                                <div>
                                    <h4>{f.title}</h4>
                                    <p>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="nearby-section">
                <div className="container">
                    <div className="section-header-row">
                        <div>
                            <h2>Complaints Near You</h2>
                            <p>Pune Municipal Corporation, Maharashtra</p>
                        </div>
                        <Link to="/my-complaints" className="btn btn-secondary btn-sm">
                            View All <ArrowRight size={12} />
                        </Link>
                    </div>
                    {loading ? (
                        <div className="loader-wrapper"><div className="loader-spinner" /></div>
                    ) : (
                        <div className="nearby-grid">
                            {nearby.map((c) => (
                                <Link key={c.id} to={`/complaint/${c.id}`} className="complaint-card card card-glow">
                                    <div className="cc-header">
                                        <CategoryTag category={c.category} />
                                        <StatusBadge status={c.status} />
                                    </div>
                                    <p className="cc-desc">{c.description}</p>
                                    <div className="cc-meta">
                                        <span className="cc-meta-item"><MapPin size={13} /> {c.address.split(',')[0]}</span>
                                        <span className="cc-meta-item"><TrendingUp size={12} /> {c.upvotes}</span>
                                        <TimeAgo date={c.createdAt} />
                                    </div>
                                    <div className="cc-footer">
                                        <SeverityBadge severity={c.severity} />
                                        <span className="cc-priority">Priority: <strong>{c.priorityScore}</strong></span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </section>
            <section className="cta-section">
                <div className="container">
                    <div className="cta-box">
                        <h2>Help Improve Your City</h2>
                        <p>Join thousands of citizens across India making their city cleaner, safer, and smarter.</p>
                        <Link to="/submit" className="btn btn-primary btn-lg">
                            <Camera size={16} /> Report an Issue Now
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};
export default Home;
