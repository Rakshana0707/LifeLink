# 🩸 LifeLink — Comprehensive Blood Donation & Emergency Transfusion Platform

LifeLink is a production-grade healthcare technology platform connecting blood donors, hospitals, blood banks, and platform administrators. It provides emergency blood matching, live dispatch, multi-source donation camp management, digital donor passports with gamification, real-time inventory management, and an AI-powered clinical assistance service.

---

## 1. System Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Client Applications      │
                                  │  React 19 + TypeScript + Vite │
                                  │          (Port 5173)          │
                                  └───────────────┬───────────────┘
                                                  │
                                  HTTPS / JSON    │   Firebase Auth Tokens
                                  (Proxy / Direct)│   (Google OAuth / Email)
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │      Express Backend API      │
                                  │      Node.js (Port 8000)      │
                                  │  - Auth & Role-Based Routing  │
                                  │  - Emergency Matching Engine  │
                                  │  - Server-Sent Events (SSE)   │
                                  │  - Audit Logging & Rate Limit │
                                  └───────┬───────────────┬───────┘
                                          │               │
                 Internal Reverse Proxy   │               │   SQL Queries
                  (/api/nlp, /chat, /rag) │               │   (node:sqlite)
                                          ▼               ▼
┌───────────────────────────────────────────────┐   ┌───────────────────────────────┐
│              FastAPI AI Service               │   │      Persistent Storage       │
│             Python 3.14 (Port 8001)           │   │         SQLite Database       │
│  - LoRA Fine-Tuned Intent Classification      │   │          (lifelink.db)        │
│  - BERT Named Entity Recognition (NER)        │   │          - 25 Tables          │
│  - FAISS Vector DB + Flan-T5 RAG Pipeline     │   │          - 50 Indexes         │
│  - Emergency 108/112 Clinical Safety Notices  │   │          - Full WAL Mode      │
└───────────────────────────────────────────────┘   └───────────────────────────────┘
```

### Core Services
1. **Frontend (`client/`)**: React 19, TypeScript, Vite, Tailwind/CSS custom properties, Leaflet Maps, Recharts.
2. **Backend Server (`server.js`)**: Express, Node.js (`>=22.5.0` with `node:sqlite`), Firebase Admin SDK, SSE event broadcast, token-bucket rate limiting.
3. **AI Medical Microservice (`backend/`)**: FastAPI, PyTorch, HuggingFace Transformers (`flan-t5-small`, `dslim/bert-base-NER`, `distilbert-base-uncased`), FAISS vector store.
4. **Primary Database (`lifelink.db`)**: Embedded SQLite in WAL (Write-Ahead Logging) mode with foreign keys enabled.
5. **Real-time Pipeline**: Server-Sent Events (`/api/events/stream`) with heartbeat monitoring, auto-reconnect, and client connection reference counting.

---

## 2. Four Platform User Roles & Permissions

| Role | Primary Dashboard | Permissions & Capabilities | Verification Requirement |
|---|---|---|---|
| **Donor** | `/donor` | View eligibility countdown, request emergency responses, book camp slots, view donation passport, earn digital badges, download donation certificates, view leaderboard. | Public self-registration (email/password or Google sign-in). |
| **Hospital** | `/hospital` | Create and broadcast emergency requests, review compatible matched donors, reserve and fulfill blood units, manage hospital profile. | Mandatory admin onboarding verification; verified license & accreditation required. |
| **Blood Bank** | `/bloodbank` | Manage component stock levels (units per ABO/Rh blood group), process inbound/outbound transfer requests, coordinate camp logistics. | Mandatory admin onboarding verification; verified clinical blood bank license required. |
| **Admin** | `/admin` | Platform oversight: approve/reject institutional onboarding, verify external camps, view platform analytics, monitor emergency history, run demand forecast. | Seeded credentials only; public registration permanently prohibited. |

---

## 3. Database Architecture (25 Tables)

The application utilizes an auditable, normalized SQLite database (`lifelink.db`):

| Category | Tables |
|---|---|
| **Identity & Access** | `users`, `donor_profiles`, `hospital_profiles`, `blood_bank_profiles`, `otp_codes`, `audit_logs` |
| **Clinical Blood Domain**| `blood_groups`, `blood_compatibility`, `blood_inventory` |
| **Emergency & Matching**| `emergencies`, `donor_matches`, `emergency_status_history` |
| **Camps & Community** | `camps`, `camp_ingestion_runs`, `camp_registrations`, `appointments` |
| **Donations & Transfers**| `donations`, `transfers` |
| **Real-time Comms** | `notifications`, `notification_preferences`, `notification_deliveries` |
| **Spatial & Analytics** | `locations`, `analytics_events`, `ai_predictions`, `synthetic_demand_history` |

- **Integrity**: `PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`.
- **Performance**: 50 targeted compound and foreign-key indexes.
- **Auditing**: Every critical status transition and administrative override logs to `emergency_status_history` and `audit_logs`.

---

## 4. API Endpoints Reference

### Authentication & Profiles
- `POST /api/auth/register` — Public donor registration with password hashing.
- `POST /api/auth/login` — Password / username login with session token issuance.
- `POST /api/auth/otp/send` & `POST /api/auth/otp/verify` — Telegram 2FA verification.
- `GET /api/users/me` — Authenticated session verification & profile retrieval.
- `POST /api/users/sync` — Firebase UID to SQLite profile provisioning.
- `GET /api/users` & `PUT /api/users/:id` — User profile retrieval and administrative updates.

### Emergencies & Real-Time Matching
- `POST /api/emergencies` — Create blood emergency request.
- `GET /api/emergencies` & `GET /api/emergencies/:id` — Query active emergencies with status.
- `GET /api/emergencies/:id/history` — Audit trail of status transitions.
- `POST /api/emergencies/:id/respond` — Donor response (Accept/Decline).
- `POST /api/emergencies/:id/reserve` — Hospital reservation of matched donor.
- `POST /api/emergencies/:id/fulfill` — Mark emergency fulfilled.
- `POST /api/emergencies/:id/cancel` — Cancel emergency request.
- `POST /api/matching/rank-donors` — Authoritative algorithmic donor ranking.
- `GET /api/events/stream` — Real-time Server-Sent Events (SSE) push stream.

### Camps & Multi-Source Ingestion
- `GET /api/camps` & `POST /api/camps` — Query and create donation camps.
- `PUT /api/camps/:id/verify` — Admin verification of imported camps.
- `POST /api/camps/ingest` — Execute multi-source ingestion pipeline.
- `GET /api/camps/ingestion/runs` — Ingestion execution history and error logs.
- `POST /api/camp_registrations` — Donor slot reservation.

### Donor Passport & Gamification
- `GET /api/donations` — Verified completed donation records.
- `GET /api/donations/:id/certificate` — Official donation certificate generation.
- `GET /api/leaderboard` — Privacy-masked community donor leaderboard.

### AI Medical Assistant (Proxy to Port 8001)
- `GET /health` & `GET /api/health` — AI service & FAISS index health check.
- `POST /api/nlp/parse` — Clinical entity extraction (blood group, units, hospital, urgency).
- `POST /api/chat/message` — Interactive clinical conversation with emergency triage.
- `POST /api/rag/query` — Retrieval-Augmented Generation over verified medical knowledge.
- `GET /api/chat/history/:conversation_id` — Synchronized conversation history.

---

## 5. Security & Medical Safety Standards

1. **Authentication Correctness**:
   - Backend independently enforces role authorization (`requireAuth`, `requireAdmin`, `requireHospital`, `requireBloodBank`, `requireDonor`). Local storage roles are never trusted.
   - Session restoration validates Firebase tokens and maps them to local SQLite profile records.
2. **Medical Safety Enforcements**:
   - Informational only: Assistant explicitly states it is an automated assistant, not a doctor.
   - Refusal to clear unassessed medical conditions: complex or unverified conditions (e.g., systemic lupus, oncology treatments) return refusal to certify and direct to clinical officers.
   - Acute emergency non-delay notices: immediate guidance to contact 108 / 112 emergency trauma services.
3. **Data Protection**:
   - Strict PII masking: exact donor coordinates, phone numbers, and Telegram chat IDs are restricted to the account owner or verified Admins.
   - Community leaderboard masks full names (e.g., `Shiv R.`) and redacts contact info.
   - Zero SQL injection: 100% of SQLite queries utilize parameterized bindings.

---

## 6. Installation & Local Development

### Prerequisites
- **Node.js**: Version `22.5.0` or higher (utilizes native `node:sqlite`).
- **Python**: Version `3.10` to `3.14` with `pip`.
- **Git**

### Step-by-Step Setup
```bash
# 1. Clone Repository
git clone https://github.com/Rakshana0707/LifeLink.git
cd LifeLink

# 2. Install Root (Backend) Dependencies
npm install

# 3. Install Client (Frontend) Dependencies
npm install --prefix client

# 4. Set Up Python AI Microservice Virtual Environment
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
cd ..

# 5. Configure Environment Variables
cp .env.example .env
cp client/.env.example client/.env

# 6. Initialize & Seed Database
npm run setup

# 7. Start Full Development Stack
# Runs Express backend (8000) and Vite client (5173) concurrently:
npm run dev
```

To run the AI Microservice alongside in development:
```bash
# In a separate terminal with backend venv activated:
cd backend
python -m uvicorn main:app --port 8001 --host 0.0.0.0
```

---

## 7. Environment Variables Reference

### Backend (`.env`)
```ini
# Production Session Secret (Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=your_32_byte_hex_secret

# Server Port (Default: 8000)
PORT=8000

# Environment Mode ('development' | 'production')
NODE_ENV=development

# Trust First Proxy Hop (Enable if behind NGINX, Cloudflare, AWS ALB)
TRUST_PROXY=false

# Telegram Bot Token (Optional: logs codes to server console if omitted)
TELEGRAM_BOT_TOKEN=

# Path to Firebase Admin SDK Service Account JSON Key
FIREBASE_CREDENTIALS_PATH=./firebase-adminsdk.json

# URL to Python FastAPI Microservice
PYTHON_API_URL=http://localhost:8001
```

### Client Frontend (`client/.env`)
```ini
VITE_FIREBASE_PROJECT_ID=lifelink-demo
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=lifelink-demo.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=lifelink-demo.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

### Firebase Authorized Domains
In Firebase Console $\rightarrow$ Authentication $\rightarrow$ Settings $\rightarrow$ Authorized Domains, add:
- `localhost`
- `127.0.0.1`
- `your-production-domain.com`

---

## 8. Test Execution & Quality Assurance

LifeLink includes an extensive test suite covering backend unit tests, authentication integration, role-based access control, matching logic, passport sync, and AI clinical safety:

```bash
# 1. Run Complete Node.js Test Suite (204 Tests)
npm test

# 2. Run Python AI Assistant Test Suite (10 Tests)
# Windows PowerShell:
$env:HF_HUB_OFFLINE="1"; $env:TRANSFORMERS_OFFLINE="1"; backend\venv\Scripts\pytest.exe -v backend\test_main.py
# Linux/macOS:
# HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 backend/venv/bin/pytest -v backend/test_main.py

# 3. Run Database Integrity & Backup Verification
node tests/db_audit.js

# 4. Run Code Security & Parameterization Scan
node tests/security_scan.js

# 5. Build Client Production Bundle
npm run build
```

---

## 9. Production Deployment

### Option A: Unified Full-Stack Run (Recommended)
Express serves both the API endpoints and the compiled React production bundle from `client/dist`:

```bash
# Build the client bundle
npm run build

# Start both Express (8000) and FastAPI AI Service (8001) via launcher:
npm start
```

### Option B: Containerized / Multi-Process Architecture
In enterprise deployments:
1. **Frontend**: Serve `client/dist` via NGINX or AWS S3 + CloudFront CDN.
2. **Backend**: Run `node server.js` under PM2 or Docker (`PORT=8000`).
3. **AI Service**: Run `uvicorn backend.main:app --host 0.0.0.0 --port 8001 --workers 2`.
4. **Reverse Proxy (NGINX)**:
   ```nginx
   server {
       listen 80;
       server_name lifelink.example.com;

       location /api/nlp { proxy_pass http://127.0.0.1:8001; }
       location /api/chat { proxy_pass http://127.0.0.1:8001; }
       location /api/rag { proxy_pass http://127.0.0.1:8001; }
       location /api/ { proxy_pass http://127.0.0.1:8000; }
       location / {
           root /var/www/lifelink/client/dist;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

### Database Persistence & Backups
SQLite database (`lifelink.db`) resides on disk. To execute consistent live snapshots without downtime:
```bash
node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('lifelink.db'); db.exec(\"VACUUM INTO 'lifelink_backup_\" + Date.now() + \".db'\");"
```
