export { login, verifyOtp } from './authApi';

export {
    getComplaints,
    getComplaintById,
    getNearbyComplaints,
    upvoteComplaint,
    deleteComplaint,
    submitComplaint,
    updateComplaintStatus,
    assignComplaint,
    bulkUpdateComplaints,
    workerRespondToTask,
    resolveWithProof,
    getUploadUrl,
    analyzeImages,
    analyzeImage,
} from './complaintsApi';

export {
    getWorkers,
    addWorker,
    removeWorker,
    getWorkerStats,
} from './workersApi';

export {
    getSlaBreaches,
    getDashboardStats,
    getWorkerAssignments,
} from './analyticsApi';
