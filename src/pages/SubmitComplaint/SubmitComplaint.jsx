import { useState } from 'react';
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
        analysisProgress,
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

    const [dragging, setDragging] = useState(false);
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation(); setDragging(false);
        if (e.dataTransfer.files?.length) addImages(e.dataTransfer.files);
    };

    return (
        <div className="submit-page">
            <div className="container">
                <div className="submit-container">
                    {/* ── Premium High-Contrast Stepper ── */}
                    <div className="segmented-progress premium-stepper">
                        {STEPS.map((label, i) => (
                            <div key={label} className={`segment ${i === step ? 'active' : i < step ? 'done' : 'pending'}`}>
                                <div className="segment-number">{i < step ? '✓' : i + 1}</div>
                                <span className="segment-label hide-mobile">{label}</span>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="error-banner" role="alert">
                            <X size={16} />
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="error-dismiss-btn">
                                Dismiss
                            </button>
                        </div>
                    )}

                    {step === 0 && (
                        <div className="step-content animate-fade-in">
                            <h2>
                                Upload Photos
                                {images.length > 0 && (
                                    <span className="badge badge-info step-count-badge">
                                        {images.length} / 5
                                    </span>
                                )}
                            </h2>
                            <p className="text-muted">Take or upload up to 5 photos — AI will analyze the primary photo while others serve as supporting evidence</p>
                            <div className="upload-format-hints">
                                <span className="upload-hint-pill">JPG / PNG / HEIC</span>
                                <span className="upload-hint-pill">Max 10MB each</span>
                                <span className="upload-hint-pill">Up to 5 photos</span>
                            </div>
                            <button
                                type="button"
                                className={`upload-zone${dragging ? ' drag-over' : ''}`}
                                onClick={() => document.getElementById('file-input').click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
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
                                {location.latitude && <span className="location-status-pill">GPS Locked</span>}
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
                            <div className="input-group details-input-group">
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
                            <div className="step-actions step-actions-compact">
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
                            <p className="text-muted">Our AI engine is aggressively analyzing the primary photo to detect the civic issue</p>
                            <div className="analysis-steps">
                                <div className={`a-step ${analysisProgress ? 'done' : 'active'}`}>
                                    {analysisProgress ? <CheckCircle size={14} /> : <Loader2 size={14} className="spin-icon" />} Uploading image
                                </div>
                                <div className={`a-step ${['severity','description'].some(s => analysisProgress === s) ? 'done' : analysisProgress === 'detecting' ? 'active' : ''}`}>
                                    {['severity','description'].some(s => analysisProgress === s) ? <CheckCircle size={14} /> : analysisProgress === 'detecting' ? <Loader2 size={14} className="spin-icon" /> : null} Detecting issue type...
                                </div>
                                <div className={`a-step ${analysisProgress === 'description' ? 'done' : analysisProgress === 'severity' ? 'active' : ''}`}>
                                    {analysisProgress === 'description' ? <CheckCircle size={14} /> : analysisProgress === 'severity' ? <Loader2 size={14} className="spin-icon" /> : null} Assessing severity...
                                </div>
                                <div className={`a-step ${analysisProgress === 'description' ? 'active' : ''}`}>
                                    {analysisProgress === 'description' ? <Loader2 size={14} className="spin-icon" /> : null} Generating description...
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && analysis && (
                        <div className="step-content animate-fade-in">
                            <h2>AI Analysis Results</h2>
                            <p className="text-muted">Review the automated analysis before submitting</p>

                            {/* Multi-photo strip */}
                            {previews.length > 0 && (
                                <div className="review-photo-strip">
                                    {previews.map((src, i) => (
                                        <div key={src} className="review-photo-thumb">
                                            <img src={src} alt={`Photo ${i + 1}`} />
                                            {i === 0 && (
                                                <span className="review-photo-label">Primary</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

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
                            <div className="input-group details-input-group">
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
                                            className="btn btn-sm btn-secondary copy-id-btn"
                                            onClick={() => navigator.clipboard.writeText(result.complaintId)}
                                            title="Copy ID"
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
                            <p className="text-sm text-muted confirmation-note">
                                You will receive SMS and push notifications on status updates.
                            </p>
                            <div className="step-actions step-actions-center">
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
