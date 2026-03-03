import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, MapPin, Loader2, CheckCircle, ArrowLeft, ArrowRight, X, Camera, Edit3, Cpu } from 'lucide-react';
import { analyzeImage, submitComplaint } from '../../services/api';
import { SeverityBadge, CategoryTag, PriorityBar } from '../../components/Shared/Shared';
import './SubmitComplaint.css';
const STEPS = ['Upload Photo', 'AI Analysis', 'Review & Submit', 'Confirmed'];
const SubmitComplaint = () => {
    const [step, setStep] = useState(0);
    const [images, setImages] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [s3Key, setS3Key] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [userNote, setUserNote] = useState('');
    const [error, setError] = useState(null);
    const [location, setLocation] = useState({ latitude: null, longitude: null, address: 'Detecting location...' });
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setLocation({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        address: `${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`,
                    });
                },
                () => {
                    setLocation({ latitude: 18.5204, longitude: 73.8567, address: 'Pune, Maharashtra (default)' });
                }
            );
        }
    }, []);
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files).slice(0, 5 - images.length);
        const newImages = [...images, ...files];
        setImages(newImages);
        const newPreviews = files.map((f) => URL.createObjectURL(f));
        setPreviews((prev) => [...prev, ...newPreviews]);
    };
    const removeImage = (idx) => {
        setImages((prev) => prev.filter((_, i) => i !== idx));
        setPreviews((prev) => prev.filter((_, i) => i !== idx));
    };
    const handleAnalyze = async () => {
        setStep(1);
        setAnalyzing(true);
        setError(null);
        try {
            const res = await analyzeImage(images[0]);
            setAnalysis(res.analysis);
            if (res.s3Key) setS3Key(res.s3Key);
            setStep(2);
        } catch (err) {
            setError('Analysis failed. Please try again.');
            setStep(0);
        } finally {
            setAnalyzing(false);
        }
    };
    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const savedUser = JSON.parse(localStorage.getItem('civicai_user') || '{}');
            const res = await submitComplaint({
                analysis,
                userNote,
                userName: savedUser.name || '',
                userPhone: savedUser.phone || '',
                images,
                s3Key,
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address,
            });
            setResult(res);
            setStep(3);
        } catch (err) {
            setError('Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };
    return (
        <div className="submit-page">
            <div className="container">
                <div className="submit-container">
                    <div className="progress-bar">
                        {STEPS.map((s, i) => (
                            <div key={i} className={`progress-step ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                                <div className="progress-dot">
                                    {i < step ? <CheckCircle size={16} /> : <span>{i + 1}</span>}
                                </div>
                                <span className="progress-label hide-mobile">{s}</span>
                            </div>
                        ))}
                        <div className="progress-line">
                            <div className="progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
                        </div>
                    </div>
                    {error && (
                        <div className="card" style={{ background: 'var(--error, #DC2626)', color: '#fff', padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-md)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <X size={16} />
                            <span>{error}</span>
                            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>Dismiss</button>
                        </div>
                    )}
                    {step === 0 && (
                        <div className="step-content animate-fade-in">
                            <h2>Upload Photos</h2>
                            <p className="text-muted">Take or upload up to 5 photos of the civic issue</p>
                            <div className="upload-zone" onClick={() => document.getElementById('file-input').click()}>
                                <input id="file-input" type="file" accept="image/*" multiple hidden onChange={handleFileChange} />
                                <Upload size={36} strokeWidth={1.5} />
                                <p><strong>Click to upload</strong> or drag and drop</p>
                                <span className="text-sm text-muted">JPG, PNG, HEIC — Max 10MB each</span>
                            </div>
                            {previews.length > 0 && (
                                <div className="image-previews">
                                    {previews.map((src, i) => (
                                        <div key={i} className="preview-item">
                                            <img src={src} alt={`Preview ${i + 1}`} />
                                            <button className="preview-remove" onClick={() => removeImage(i)}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {previews.length < 5 && (
                                        <div className="preview-add" onClick={() => document.getElementById('file-input').click()}>
                                            <Camera size={20} />
                                            <span>Add</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="location-card card">
                                <MapPin size={18} className="loc-icon" />
                                <div>
                                    <p className="font-medium">Location Detected</p>
                                    <p className="text-sm text-muted">{location.address}</p>
                                </div>
                                {location.latitude && (
                                    <span className="text-sm" style={{ color: 'var(--success)' }}>✓ GPS</span>
                                )}
                            </div>
                            <div className="step-actions">
                                <Link to="/" className="btn btn-secondary"><ArrowLeft size={16} /> Back</Link>
                                <button className="btn btn-primary" disabled={images.length === 0} onClick={handleAnalyze}>
                                    Analyze with AI <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                    {step === 1 && analyzing && (
                        <div className="step-content animate-fade-in text-center">
                            <div className="analyzing-anim">
                                <div className="ai-ring" />
                                <Cpu size={28} className="ai-icon-svg" />
                            </div>
                            <h2>AI is Analyzing...</h2>
                            <p className="text-muted">Our AI engine is detecting issues in your photo</p>
                            <div className="analysis-steps">
                                <div className="a-step done"><CheckCircle size={14} /> Uploading image</div>
                                <div className="a-step active"><Loader2 size={14} className="spin-icon" /> Detecting issue type...</div>
                                <div className="a-step">Assessing severity...</div>
                                <div className="a-step">Generating description...</div>
                            </div>
                        </div>
                    )}
                    {step === 2 && analysis && (
                        <div className="step-content animate-fade-in">
                            <h2>AI Analysis Results</h2>
                            <p className="text-muted">Review the automated analysis before submitting</p>
                            <div className="analysis-card card">
                                <div className="analysis-row">
                                    <span className="analysis-label">Category</span>
                                    <CategoryTag category={analysis.category} />
                                </div>
                                <div className="analysis-row">
                                    <span className="analysis-label">Severity</span>
                                    <SeverityBadge severity={analysis.severity} />
                                </div>
                                <div className="analysis-row">
                                    <span className="analysis-label">Confidence</span>
                                    <span className="confidence-val">{Math.round(analysis.confidence * 100)}%</span>
                                </div>
                                <div className="analysis-row">
                                    <span className="analysis-label">Priority Score</span>
                                    <PriorityBar score={analysis.priorityScore} />
                                </div>
                                <div className="analysis-row">
                                    <span className="analysis-label">Department</span>
                                    <span className="font-medium">{analysis.department}</span>
                                </div>
                                <div className="analysis-row">
                                    <span className="analysis-label">Est. Resolution</span>
                                    <span>{analysis.estimatedResolutionTime}</span>
                                </div>
                                <div className="analysis-desc">
                                    <div className="flex justify-between items-center">
                                        <span className="analysis-label">AI Description</span>
                                        <button className="btn btn-sm btn-secondary"><Edit3 size={12} /> Edit</button>
                                    </div>
                                    <p>{analysis.description}</p>
                                </div>
                                <div className="analysis-actions-list">
                                    <span className="analysis-label">Suggested Actions</span>
                                    <ul>
                                        {analysis.suggestedActions.map((a, i) => (
                                            <li key={i}>{a}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <div className="input-group" style={{ marginTop: 'var(--space-md)' }}>
                                <label>Additional Notes (Optional)</label>
                                <textarea
                                    className="input"
                                    placeholder="Add any extra context..."
                                    value={userNote}
                                    onChange={(e) => setUserNote(e.target.value)}
                                />
                            </div>
                            <div className="step-actions">
                                <button className="btn btn-secondary" onClick={() => setStep(0)}><ArrowLeft size={16} /> Back</button>
                                <button className="btn btn-success btn-lg" onClick={handleSubmit} disabled={submitting}>
                                    {submitting ? <><Loader2 size={16} className="spin-icon" /> Submitting...</> : <>Submit Complaint <CheckCircle size={16} /></>}
                                </button>
                            </div>
                        </div>
                    )}
                    {step === 3 && result && (
                        <div className="step-content animate-fade-in text-center">
                            <div className="success-anim">
                                <CheckCircle size={56} color="var(--success)" />
                            </div>
                            <h2>Complaint Submitted!</h2>
                            <p className="text-muted">Your complaint has been successfully registered and routed.</p>
                            <div className="confirmation-card card">
                                <div className="conf-row">
                                    <span>Complaint ID</span>
                                    <strong className="conf-id">{result.complaintId}</strong>
                                </div>
                                <div className="conf-row">
                                    <span>Status</span>
                                    <span className="badge badge-submitted">Submitted</span>
                                </div>
                                <div className="conf-row">
                                    <span>Est. Resolution</span>
                                    <span>{result.estimatedResolution}</span>
                                </div>
                            </div>
                            <p className="text-sm text-muted" style={{ marginTop: 'var(--space-md)' }}>
                                You will receive SMS and push notifications on status updates.
                            </p>
                            <div className="step-actions" style={{ justifyContent: 'center' }}>
                                <Link to="/my-complaints" className="btn btn-primary">Track Complaint</Link>
                                <Link to="/submit" className="btn btn-secondary" onClick={() => { setStep(0); setImages([]); setPreviews([]); setAnalysis(null); setResult(null); }}>
                                    Submit Another
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
export default SubmitComplaint;
