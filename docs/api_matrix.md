# JanSevaAI API Matrix

This document maps backend endpoints to frontend callers, expected roles, and common write effects.

## Legend

- `RO` = read-only endpoint
- `RW` = write/update endpoint
- Roles: `citizen`, `admin`, `worker`

## Auth

| Endpoint | Method | Mode | Frontend caller | Service fn | Roles | Backend handler |
|---|---|---:|---|---|---|---|
| `/auth/send-otp` | `POST` | RO | `src/pages/Login/Login.jsx` | `login` | public | `backend/auth/lambda_function.py` |
| `/auth/verify-otp` | `POST` | RO | `src/pages/Login/Login.jsx` | `verifyOtp` | public | `backend/auth/lambda_function.py` |

## Complaints (Read)

| Endpoint | Method | Mode | Frontend caller(s) | Service fn | Roles | Backend handler |
|---|---|---:|---|---|---|---|
| `/complaints` | `GET` | RO | `Dashboard`, `MyComplaints`, `AdminComplaints`, `Worker`, `Analytics` | `getComplaints` | citizen/admin/worker | `backend/get_user_complaints/lambda_function.py` |
| `/complaints/{id}` | `GET` | RO | `ComplaintDetail` | `getComplaintById` | citizen/admin/worker | `backend/get_complaint/lambda_function.py` |
| `/complaints/nearby` | `GET` | RO | `Home` | `getNearbyComplaints` | citizen/admin/worker | `backend/get_nearby_complaints/lambda_function.py` |

## Complaints (Write)

| Endpoint | Method | Mode | Frontend caller(s) | Service fn | Roles | Backend handler | Primary write effect |
|---|---|---:|---|---|---|---|---|
| `/complaints` | `POST` | RW | `SubmitComplaint` via `useComplaintSubmission` | `submitComplaint` | citizen/admin/worker | `backend/submit_complaint/lambda_function.py` | Finalizes submitted complaint fields |
| `/complaints/{id}/status` | `PATCH` | RW | `ComplaintDetail`, `AdminComplaints`, `Worker` | `updateComplaintStatus`, `workerRespondToTask`, `resolveWithProof` | admin/worker | `backend/update_complaint_status/lambda_function.py` | Updates status/history, optional proof + resolve GPS |
| `/complaints/{id}/assign` | `POST` | RW | `AdminComplaints` | `assignComplaint` | admin | `backend/assign_complaint/lambda_function.py` | Assigns worker + SLA deadline + history |
| `/complaints/bulk` | `POST` | RW | `AdminComplaints` | `bulkUpdateComplaints` | admin | `backend/bulk_update/lambda_function.py` | Bulk status/assignment updates |
| `/complaints/{id}/upvote` | `POST` | RW | `ComplaintDetail` | `upvoteComplaint` | citizen/admin/worker | `backend/upvote_complaint/lambda_function.py` | Increments upvotes and priority |
| `/complaints/{id}` | `DELETE` | RW | `MyComplaints`, `ComplaintDetail` | `deleteComplaint` | admin or owner-citizen | `backend/delete_complaint/lambda_function.py` | Deletes complaint record |

## Upload / AI Pipeline

| Endpoint | Method | Mode | Frontend caller(s) | Service fn | Roles | Backend handler | Primary write effect |
|---|---|---:|---|---|---|---|---|
| `/upload/presign` | `POST` | RO | `SubmitComplaint`, `Worker` (resolve proof) | `getUploadUrl` | citizen/admin/worker | `backend/generate_upload_url/lambda_function.py` | Generates presigned S3 PUT URL |

Notes:
- `analyzeImages` and `analyzeImage` are frontend workflows that call `/upload/presign` and then poll `/complaints/{id}` for AI output populated asynchronously by backend image processing.

## Workers

| Endpoint | Method | Mode | Frontend caller(s) | Service fn | Roles | Backend handler | Primary write effect |
|---|---|---:|---|---|---|---|---|
| `/workers` | `GET` | RO | `AdminWorkers`, `AdminComplaints` (admin-only usage) | `getWorkers` | admin | `backend/manage_workers/lambda_function.py` | Returns worker roster |
| `/workers` | `POST` | RW | `AdminWorkers` | `addWorker` | admin | `backend/manage_workers/lambda_function.py` | Adds worker |
| `/workers/{phone}` | `DELETE` | RW | `AdminWorkers` | `removeWorker` | admin | `backend/manage_workers/lambda_function.py` | Removes worker |

## Frontend-only computed analytics

These service functions do not hit dedicated endpoints; they compute from `/complaints` responses:

- `getDashboardStats`
- `getSlaBreaches`
- `getWorkerAssignments`
- `getWorkerStats`

Implementation files:

- `src/services/analyticsApi.js`
- `src/services/workersApi.js`

## Operational checks completed

Recent smoke verification against current production API base URL validated:

- Auth send/verify OTP (citizen/admin/worker)
- Complaints list/detail
- Upvote
- Status patch
- Assign
- Bulk update
- Workers list (admin pass, citizen 403 expected)
- Presign upload
- Nearby complaints

One backend config issue was corrected during verification:

- `civicai-bulk-update` Lambda was missing `JWT_SECRET`, causing admin bulk requests to fail with `401`.
- Updated Lambda environment to include `JWT_SECRET`; bulk endpoint now passes.
