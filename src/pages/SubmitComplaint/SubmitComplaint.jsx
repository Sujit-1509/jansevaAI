import { Link } from 'react-router-dom';
import {
    Upload,
    MapPin,
    Loader2,
    CheckCircle,
    ArrowLeft,
    ArrowRight,
    X,
    Camera,
    Edit3,
    Cpu,
    Copy,
} from 'lucide-react';
import { SeverityBadge, CategoryTag, PriorityBar } from '../../components/Shared/Shared';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import { useComplaintSubmission } from '../../hooks/useComplaintSubmission';
import './SubmitComplaint.css';

const STEPS = ['Upload Photo', 'Provide Details', 'AI Analysis', 'Review & Submit', 'Confirmed'];

const SubmitComplaint = () => {
    const location = useCurrentLocation();
    const {
        step,
        setStep,
        images,
        previews,
        analysis,
        setAnalysis,
        result,
        userNote,
        setUserNote,
        analyzing,
        submitting,
        error,
        setError,
        addImages,
        removeImage,
        runAnalysis,
        submit,
        reset,
    } = useComplaintSubmission(location);

    const handleFileChange = (e) => {
        addImages(e.target.files);
    };

    return (
        <div className="submit-page">
            <div className="container">
                <div className="submit-container">
                    <div className="progress-bar">
                        {STEPS.map((label, i) => (
                            <div
                                key={label}
                                className={`progress-step ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                            >
                                <div className="progress-dot">
                                    {i < step ? <CheckCircle size={16} /> : <span>{i + 1}</span>}
                                </div>
                                <span className="progress-label hide-mobile">{label}</span>
                            </div>
                        ))}
                        <div className="progress-line">
                            <div className="progress-fill" style={{ width: `${(step / 4) * 100}%` }} />
                        </div>
                    </div>

                    {error && (
                        <div
                            className="card"
                            style={{
                                background: 'var(--danger)',
                                color: '#fff',
                                padding: 'var(--space-sm) var(--space-md)',
                                marginBottom: 'var(--space-md)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            <X size={16} />
                            <span>{error}</span>
                            <button
                                onClick={() => setError(null)}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {step === 0 && (
                        <div className="step-content animate-fade-in">
                            <h2>Upload Photos</h2>
                            <p className="text-muted">Take or upload up to 5 photos of the civic issue</p>
                            <button
                                type="button"
                                className="upload-zone"
                                onClick={() => document.getElementById('file-input').click()}
                                aria-label="Upload complaint photos"
                            >
                                <input
                                    id="file-input"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={handleFileChange}
                                />
                                <Upload size={36} strokeWidth={1.5} />
                                <p>
                                    <strong>Click to upload</strong> or drag and drop
                                </p>
                                <span className="text-sm text-muted">JPG, PNG, HEIC - Max 10MB each</span>
                            </button>
                            {previews.length > 0 && (
                                <div className="image-previews">
                                    {previews.map((src, i) => (
                                        <div key={src} className="preview-item">
                                            <img src={src} alt={`Preview ${i + 1}`} />
                                            <button className="preview-remove" onClick={() => removeImage(i)}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {previews.length < 5 && (
                                        <button
                                            type="button"
                                            className="preview-add"
                                            onClick={() => document.getElementById('file-input').click()}
                                        >
                                            <Camera size={20} />
                                            <span>Add</span>
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="location-card card">
                                <MapPin size={18} className="loc-icon" />
                                <div>
                                    <p className="font-medium">Location Detected</p>
                                    <p className="text-sm text-muted">{location.address}</p>
                                </div>
                                {location.latitude && <span className="text-sm status-text-success">GPS</span>}
                            </div>
                            <div className="step-actions">
                                <Link to="/" className="btn btn-secondary">
                                    <ArrowLeft size={16} /> Back
                                </Link>
                                <button
                                    className="btn btn-primary"
                                    disabled={images.length === 0}
                                    onClick={() => setStep(1)}
                                >
                                    Next Step <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="step-content animate-fade-in">
                            <h2>Provide Details</h2>
                            <p className="text-muted">Briefly explain the issue in your own words</p>
                            <div className="input-group" style={{ marginTop: 'var(--space-md)' }}>
                                <label htmlFor="complaint-note">Your View of the Complaint</label>
                                <textarea
                                    id="complaint-note"
                                    className="input"
                                    placeholder="E.g., Huge pothole causing traffic issues..."
                                    value={userNote}
                                    onChange={(e) => setUserNote(e.target.value)}
                                    rows="4"
                                />
                            </div>
                            <div className="step-actions" style={{ marginTop: 'var(--space-md)' }}>
                                <button className="btn btn-secondary" onClick={() => setStep(0)}>
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button className="btn btn-primary" onClick={runAnalysis}>
                                    Analyze with AI <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && analyzing && (
                        <div className="step-content animate-fade-in text-center" aria-live="polite">
                            <div className="analyzing-anim">
                                <div className="ai-ring" />
                                <Cpu size={28} className="ai-icon-svg" />
                            </div>
                            <h2>AI is Analyzing...</h2>
                            <p className="text-muted">Our AI engine is detecting issues in your photo</p>
                            <div className="analysis-steps">
                                <div className="a-step done">
                                    <CheckCircle size={14} /> Uploading image
                                </div>
                                <div className="a-step active">
                                    <Loader2 size={14} className="spin-icon" /> Detecting issue type...
                                </div>
                                <div className="a-step">Assessing severity...</div>
                                <div className="a-step">Generating description...</div>
                            </div>
                        </div>
                    )}

                    {step === 3 && analysis && (
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
                                        <span className="text-sm text-muted">
                                            <Edit3 size={12} style={{ verticalAlign: 'middle' }} /> Editable below
                                        </span>
                                    </div>
                                    <textarea
                                        className="input"
                                        rows="4"
                                        value={analysis.description}
                                        onChange={(e) =>
                                            setAnalysis((prev) => ({ ...prev, description: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="analysis-actions-list">
                                    <span className="analysis-label">Suggested Actions</span>
                                    <ul>
                                        {analysis.suggestedActions.map((action) => (
                                            <li key={action}>{action}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <div className="input-group" style={{ marginTop: 'var(--space-md)' }}>
                                <label htmlFor="associated-notes">Your Associated Notes</label>
                                <textarea
                                    id="associated-notes"
                                    className="input"
                                    value={userNote}
                                    onChange={(e) => setUserNote(e.target.value)}
                                />
                            </div>
                            <div className="step-actions">
                                <button className="btn btn-secondary" onClick={() => setStep(1)}>
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button className="btn btn-success btn-lg" onClick={submit} disabled={submitting}>
                                    {submitting ? (
                                        <>
                                            <Loader2 size={16} className="spin-icon" /> Submitting...
                                        </>
                                    ) : (
                                        <>
                                            Submit Complaint <CheckCircle size={16} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && result && (
                        <div className="step-content animate-fade-in text-center">
                            <div className="success-anim">
                                <CheckCircle size={56} color="var(--success)" />
                            </div>
                            <h2>Complaint Submitted!</h2>
                            <p className="text-muted">
                                Your complaint has been successfully registered and routed.
                            </p>
                            <div className="confirmation-card card">
                                <div className="conf-row">
                                    <span>Complaint ID</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <strong className="conf-id">{result.complaintId}</strong>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => navigator.clipboard.writeText(result.complaintId)}
                                            title="Copy ID"
                                            style={{ padding: '2px 6px' }}
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </div>
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
                                <Link to="/my-complaints" className="btn btn-primary">
                                    Track Complaint
                                </Link>
                                <Link
                                    to="/submit"
                                    className="btn btn-secondary"
                                    onClick={() => reset()}
                                >
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
