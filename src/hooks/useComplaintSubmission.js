import { useState } from 'react';
import { analyzeImages, submitComplaint } from '../services/api';

export function useComplaintSubmission(location) {
    const [step, setStep] = useState(0);
    const [images, setImages] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [s3Keys, setS3Keys] = useState([]);
    const [result, setResult] = useState(null);
    const [userNote, setUserNote] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const reset = () => {
        previews.forEach((preview) => URL.revokeObjectURL(preview));
        setStep(0);
        setImages([]);
        setPreviews([]);
        setAnalysis(null);
        setS3Keys([]);
        setResult(null);
        setUserNote('');
        setError(null);
        setAnalysisProgress('');
    };

    const addImages = (files) => {
        const nextFiles = Array.from(files).slice(0, 5 - images.length);
        if (nextFiles.length === 0) return;

        setImages((prev) => [...prev, ...nextFiles]);
        setPreviews((prev) => [...prev, ...nextFiles.map((file) => URL.createObjectURL(file))]);
    };

    const removeImage = (idx) => {
        const preview = previews[idx];
        if (preview) {
            URL.revokeObjectURL(preview);
        }

        setImages((prev) => prev.filter((_, i) => i !== idx));
        setPreviews((prev) => prev.filter((_, i) => i !== idx));
    };

    const runAnalysis = async () => {
        if (!images[0]) return;

        setStep(2);
        setAnalyzing(true);
        setAnalysisProgress('uploading');
        setError(null);

        try {
            const res = await analyzeImages(images, (stage) => {
                setAnalysisProgress(stage);
            });
            setAnalysis(res.analysis);
            setS3Keys(res.s3Keys || []);
            setStep(3);
        } catch (err) {
            setError('Analysis failed. Please try again.');
            setStep(1);
        } finally {
            setAnalyzing(false);
            setAnalysisProgress('');
        }
    };

    const submit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            const savedUser = JSON.parse(localStorage.getItem('JanSevaAI_user') || '{}');
            const res = await submitComplaint({
                analysis,
                userNote,
                userName: savedUser.name || '',
                userPhone: savedUser.phone || '',
                s3Keys,
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address,
            });
            setResult(res);
            setStep(4);
        } catch (err) {
            setError('Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return {
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
    };
}
