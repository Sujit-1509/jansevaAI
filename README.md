<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/120px-Emblem_of_India.svg.png" alt="Emblem of India" width="80" />
</p>

<h1 align="center">CivicAI — Smart Municipal Complaint System</h1>

<p align="center">
  <strong>AI-Powered Civic Engagement Platform</strong><br/>
  AI for Bharat Hackathon — AI for Communities Track
</p>

<p align="center">
  <a href="https://dpsfubu0rsyo3.cloudfront.net">🌐 Live Demo</a> ·
  <a href="#architecture">📐 Architecture</a> ·
  <a href="#tech-stack">🛠️ Tech Stack</a> ·
  <a href="#setup">⚡ Setup</a>
</p>

---

## 📖 Overview

CivicAI is a fully serverless platform that enables citizens to report civic issues (potholes, garbage, broken streetlights, waterlogging) by simply uploading a photo. The system uses a custom-trained **YOLOv8** computer vision model and **Amazon Bedrock (Claude)** to automatically:

1. **Detect** the issue type with 90%+ accuracy
2. **Assess** severity using rule-based logic
3. **Generate** a formal complaint description using LLM
4. **Route** it to the correct municipal department
5. **Notify** administrators via email

Citizens authenticate via OTP (SMS) and can track their complaints in real-time.

---

## 🚀 Live Demo

> **Production URL:** [https://dpsfubu0rsyo3.cloudfront.net](https://dpsfubu0rsyo3.cloudfront.net)

**Quick Login:** Enter any name, any 10-digit phone number, and use OTP `123456` to log in.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📸 **Photo-Based Reporting** | Upload a photo → AI detects potholes, garbage, broken lights, waterlogging |
| 🧠 **YOLOv8 Vision AI** | Custom-trained model with robust issue detection + confidence scoring |
| 📝 **LLM Descriptions** | Amazon Bedrock (Claude) generates formal complaint text automatically |
| 📍 **GPS Auto-Detect** | Real-time location tagging with coordinates |
| 🔐 **OTP Authentication** | Secure phone-based login via AWS SNS |
| 👤 **User-Specific Tracking** | Citizens only see their own submitted complaints |
| 📊 **Smart Routing** | Auto-assignment to PWD, Sanitation, Electrical, or Water departments |
| 📱 **Mobile Responsive** | Fully responsive design for desktop and mobile browsers |

---

<a id="architecture"></a>
## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                     │
│                    Hosted on S3 + CloudFront CDN                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       AWS API GATEWAY (REST)                         │
│                                                                      │
│  POST /auth/send-otp        POST /upload/presign                     │
│  POST /auth/verify-otp      POST /complaints                        │
│  GET  /complaints            GET  /complaints/{id}                   │
└────┬──────────┬──────────┬──────────┬──────────┬────────────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
  ┌──────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
  │ Auth │  │Upload  │  │Submit  │  │  Get   │  │  Get   │
  │Lambda│  │Presign │  │Complnt │  │Complnts│  │Complnt │
  └──┬───┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘
     │          │            │           │           │
     ▼          ▼            ▼           ▼           ▼
  ┌──────┐  ┌──────┐     ┌────────────────────────────┐
  │ SNS  │  │  S3  │────▶│      DynamoDB (Complaints)  │
  │(SMS) │  │Bucket│     └────────────────────────────┘
  └──────┘  └──┬───┘                   ▲
               │ S3 Event Trigger      │
               ▼                       │
         ┌───────────┐                 │
         │ Process   │─────────────────┘
         │ Image λ   │
         └─────┬─────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
  ┌────────┐      ┌──────────┐
  │ EC2    │      │ Bedrock  │
  │ YOLOv8 │      │ (Claude) │
  └────────┘      └──────────┘
```

### Data Flow

1. **Citizen** uploads a photo via the React frontend
2. Frontend requests a **presigned S3 URL** from the Upload Lambda
3. Image is uploaded **directly to S3** (bypasses Lambda payload limits)
4. S3 ObjectCreated event triggers the **Process Image Lambda**
5. Process Image Lambda calls **YOLOv8** on EC2 for classification
6. **Severity** is calculated, **department** is mapped, and **Bedrock** generates a description
7. Result is saved to **DynamoDB** and admin is notified via **SES**
8. Citizen finalizes with notes/GPS via the **Submit Complaint Lambda**

---

<a id="tech-stack"></a>
## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, React Router v7 |
| **Styling** | Vanilla CSS with custom design system |
| **Compute** | AWS Lambda (Python 3.12) |
| **API** | Amazon API Gateway (REST) |
| **Hosting** | Amazon S3 + CloudFront CDN |
| **Database** | Amazon DynamoDB |
| **Storage** | Amazon S3 (image storage) |
| **Auth** | AWS SNS (SMS OTP) |
| **AI/ML** | YOLOv8 (custom-trained) on EC2 |
| **LLM** | Amazon Bedrock (Claude 3 Haiku) |
| **Email** | Amazon SES |

---

## 📁 Project Structure

```
civicai-frontend/
│
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── Layout/               # Sidebar, TopBar, AppLayout, CitizenLayout
│   │   └── Shared/               # Reusable UI components (badges, tags, loaders)
│   ├── pages/
│   │   ├── Home/                 # Landing page with stats & features
│   │   ├── Login/                # OTP-based authentication
│   │   ├── SubmitComplaint/      # Multi-step complaint wizard
│   │   ├── MyComplaints/         # User's complaint list with filters
│   │   ├── ComplaintDetail/      # Individual complaint view with image
│   │   ├── Dashboard/            # Admin analytics dashboard
│   │   └── Worker/               # Field worker assignment view
│   ├── services/
│   │   ├── api.js                # API service layer with mock fallbacks
│   │   └── apiClient.js          # HTTP client with auth & error handling
│   ├── data/
│   │   └── mockData.js           # Development mock data
│   ├── App.jsx                   # Root component with routing & auth
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global design system (variables, utilities)
│
├── backend/                      # AWS Lambda function source code
│   ├── auth/                     # OTP send & verify (SNS + DynamoDB)
│   ├── generate_upload_url/      # S3 presigned URL generation
│   ├── process_image/            # AI pipeline (YOLO + Bedrock + SES)
│   ├── submit_complaint/         # Finalize complaint submission
│   ├── get_user_complaints/      # List complaints (with phone filter)
│   ├── get_complaint/            # Get single complaint by ID
│   └── README.md                 # Lambda documentation
│
├── docs/                         # Setup & deployment guides
│   ├── aws_lambda_gateway_setup.md
│   ├── frontend_hosting.md
│   └── yolo_ec2_setup.md
│
├── model/                        # YOLOv8 model artifacts (gitignored)
│   ├── best.pt                   # Trained model weights
│   ├── confusion_matrix.png      # Training evaluation
│   └── results.png               # Training metrics
│
├── .env.example                  # Environment variable template
├── .gitignore                    # Git exclusions
├── index.html                    # Vite entry HTML
├── package.json                  # Node.js dependencies
├── vite.config.js                # Vite configuration
└── README.md                     # This file
```

---

<a id="setup"></a>
## ⚡ Setup & Installation

### Prerequisites
- Node.js 18+
- AWS Account with configured services
- Python 3.12 (for Lambda development)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR-USERNAME/CivicAI.git
cd civicai-frontend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your API Gateway URL:
```
VITE_API_BASE_URL=https://your-api-id.execute-api.ap-south-1.amazonaws.com/prod
```

### 3. Run Locally

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
```

Upload the `dist/` folder to your S3 bucket and create a CloudFront invalidation.

---

## 📚 Documentation

Detailed setup guides for each AWS service:

| Guide | Description |
|-------|-------------|
| [AWS Lambda & API Gateway](docs/aws_lambda_gateway_setup.md) | Lambda creation, API routes, IAM roles |
| [Frontend Hosting](docs/frontend_hosting.md) | S3 bucket, CloudFront distribution setup |
| [YOLOv8 EC2 Server](docs/yolo_ec2_setup.md) | EC2 instance, FastAPI server, model deployment |

---

## 🔒 Security

- **Authentication**: Phone-based OTP via AWS SNS
- **Authorization**: JWT tokens with 7-day expiry
- **API Security**: API Gateway with CORS headers
- **Data Privacy**: User complaints are filtered by phone number — users only see their own data
- **Infrastructure**: All services run within AWS with IAM-scoped permissions

---

## 👥 Team

Built for the **AI for Bharat Hackathon** — AI for Communities Track.

---

## 📄 License

MIT License

---

<p align="center">
  <strong>🏛️ CivicAI</strong> — Making Indian cities smarter, one photo at a time. 🇮🇳
</p>
