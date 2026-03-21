# CivicAI — Feature Deployment Guide

## What's new in this release

| Feature | File(s) changed |
|---------|----------------|
| Assign complaint to worker | `backend/assign_complaint/` (new), `AdminComplaints.jsx` |
| Bulk actions | `backend/bulk_update/` (new), `AdminComplaints.jsx` |
| Geographic hotspot map | `Analytics.jsx` (extended) |
| SLA breach alerts | `Dashboard.jsx` (stats), `AdminComplaints.jsx` (banner) |
| Worker accept/reject | `Worker.jsx`, `update_complaint_status/lambda_function.py` |
| Photo proof on resolve | `Worker.jsx`, `api.js` (resolveWithProof) |
| Status timeline | `ComplaintDetail.jsx` (extended) |
| Worker stats | `Worker.jsx`, `api.js` (getWorkerStats) |

---

## Step 1 — DynamoDB: no schema migration needed

DynamoDB is schemaless. New fields are written on first use:

| New field | Written by | Description |
|-----------|-----------|-------------|
| `assigned_to` | assign_complaint λ | Worker phone number |
| `assigned_to_name` | assign_complaint λ | Worker display name |
| `assigned_at` | assign_complaint λ | ISO timestamp |
| `sla_deadline` | assign_complaint λ | ISO timestamp (computed from category) |
| `status_history` | update_status λ (extended) | List of history entries |
| `worker_action` | update_status λ (extended) | "accepted" or "rejected" |
| `resolution_proof_key` | update_status λ (extended) | S3 key of proof photo |

No table changes required.

---

## Step 2 — Deploy new Lambda functions

### assign_complaint

1. Create new Lambda function named `civicai-assign-complaint`
2. Runtime: Python 3.12
3. Upload `backend/assign_complaint/lambda_function.py`
4. Set environment variables:
   - `REGION` = `ap-south-1`
   - `TABLE_NAME` = `Complaints`
   - `JWT_SECRET` = (same secret as your other Lambdas)
5. IAM: needs `dynamodb:GetItem` and `dynamodb:UpdateItem` on the Complaints table

### bulk_update

1. Create new Lambda function named `civicai-bulk-update`
2. Runtime: Python 3.12
3. Upload `backend/bulk_update/lambda_function.py`
4. Set same environment variables as above
5. IAM: needs `dynamodb:UpdateItem` on the Complaints table

---

## Step 3 — Replace existing Lambda

### update_complaint_status (extended)

Replace the existing Lambda code with `backend/update_complaint_status/lambda_function.py`.
The new version:
- Appends to `status_history` list on every status change
- Accepts `workerAction` field (accepted/rejected)
- Accepts `proofS3Key` field
- Returns full `status_history` in response

No environment variable changes needed.

---

## Step 4 — API Gateway: add new routes

In your existing REST API, add:

| Method | Resource path | Lambda |
|--------|--------------|--------|
| POST | `/complaints/{id}/assign` | civicai-assign-complaint |
| POST | `/complaints/bulk` | civicai-bulk-update |

For `/complaints/{id}/assign`:
- Enable CORS (OPTIONS method, same headers as existing routes)
- Pass `{id}` as path parameter (Lambda reads it from `event.path`)

For `/complaints/bulk`:
- Enable CORS
- No path parameter needed

After adding routes, **deploy the API** to the `prod` stage.

---

## Step 5 — Frontend: replace/update files

Replace these files in your project with the new versions:

```
src/services/api.js                             ← full replacement
src/pages/AdminComplaints/AdminComplaints.jsx   ← full replacement
src/pages/AdminComplaints/AdminComplaints.css   ← full replacement
src/pages/Analytics/Analytics.jsx              ← full replacement
src/pages/Analytics/Analytics.css              ← full replacement
src/pages/Worker/Worker.jsx                    ← full replacement
src/pages/Worker/Worker.css                    ← full replacement
src/pages/ComplaintDetail/ComplaintDetail.jsx  ← full replacement
src/pages/ComplaintDetail/ComplaintDetail.css  ← APPEND to existing CSS
```

---

## Step 6 — Worker.jsx prop: pass user

The new `Worker.jsx` needs the `user` prop to filter tasks by worker phone.
Update the route in `App.jsx`:

```jsx
// Before:
<Worker />

// After:
<Worker user={user} />
```

---

## Step 7 — Worker roster (temporary)

The `MOCK_WORKERS` array at the top of `AdminComplaints.jsx` is a hardcoded list.
To use real workers, replace it with a `GET /workers` API call or fetch from DynamoDB.
For the hackathon demo, the mock workers are sufficient.

---

## Step 8 — Leaflet map

The hotspot map (Analytics → "Hotspot map" tab) loads Leaflet.js dynamically from
`unpkg.com` on first render. No npm install needed — it's loaded at runtime.
If you prefer to bundle it:

```bash
npm install leaflet
```

Then in `Analytics.jsx`, replace the dynamic script loader with:
```js
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
```

---

## SLA hours reference

Configured in `assign_complaint/lambda_function.py`:

| Category | SLA deadline |
|----------|-------------|
| water | 24 hours |
| pothole | 48 hours |
| garbage | 72 hours |
| streetlight | 96 hours |
| (other) | 72 hours |

Adjust `SLA_HOURS` dict as needed.

---

## Testing checklist

- [ ] Admin can assign a complaint → status changes to "assigned"
- [ ] Admin can bulk-select 3 complaints and mark resolved
- [ ] Admin can bulk-assign to a worker
- [ ] SLA banner appears when a complaint is past deadline
- [ ] Analytics "Hotspot map" tab renders with Leaflet markers
- [ ] Worker sees assigned tasks; Accept changes status to in_progress
- [ ] Worker can reject a task → status reverts to submitted
- [ ] Worker resolves with photo → proof image appears in ComplaintDetail
- [ ] Status timeline shows all history entries in ComplaintDetail
- [ ] Worker stats tab shows resolved count and SLA compliance rate
