# SmartFix AI — Authoritative Backend Architecture (Phase 2)

SmartFix AI is an enterprise multi-tenant maintenance operations platform. The Python backend is the **single authoritative source of truth** for all business logic, state transitions, security controls, multimodal AI triage, and persistence. The legacy Vite-hosted Node.js backend has been completely decommissioned.

---

## 1. System Architecture & Topology

```
┌─────────────────────────────────┐
│     React 19 Frontend (SPA)     │
│  (src/services/apiClient.js)    │
└────────────────┬────────────────┘
                 │
                 │ /api/v1/* (Bearer JWT)
                 ▼
┌────────────────────────────────────────────────────────┐
│               Python 3.11 Backend                      │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ app.api (Authoritative REST Router & Gateway)   │  │
│  └───────┬──────────────┬──────────────┬────────────┘  │
│          │              │              │               │
│          ▼              ▼              ▼               │
│   ┌─────────────┐┌─────────────┐┌──────────────┐       │
│   │  app.auth   ││app.lifecycle││    app.ai    │       │
│   │(PBKDF2/JWT/ ││(State Mach. ││ (Multimodal  │       │
│   │ Rate Limit) ││ Anti-Imp.)  ││ Vision RAG)  │       │
│   └─────────────┘└─────────────┘└──────────────┘       │
│          │              │              │               │
│          └──────────────┼──────────────┘               │
│                         ▼                              │
│              ┌────────────────────┐                    │
│              │    app.storage     │                    │
│              │  (BaseRepository)  │                    │
│              └──────────┬─────────┘                    │
└─────────────────────────┼──────────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│  JsonFileRepository   │   │  DynamoDBRepository   │
│  (Active Local Dev)   │   │  (AWS Cloud-Ready)    │
│       db.json         │   │   Single-Table Design │
└───────────────────────┘   └───────────────────────┘
```

---

## 2. Directory Structure

```
backend/
├── app/
│   ├── __init__.py           # Package definition
│   ├── config.py             # Configuration, env vars, production secret guardrails
│   ├── models.py             # Data classes, TicketStatus, UserRole, Specialties
│   ├── auth.py               # PBKDF2-SHA256, JWT generation/validation, Cognito verification, rate limiting
│   ├── storage.py            # BaseRepository interface, JsonFileRepository & DynamoDBRepository adapters
│   ├── lifecycle.py          # State machine, anti-impersonation, safety overrides, dual approval
│   ├── rag.py                # Semantic embeddings (text-embedding-004), verified-repair gating
│   ├── ai.py                 # Gemini 2.5 Flash multimodal vision analysis & Open-Meteo context
│   ├── audit.py              # Immutable multi-tenant audit trail service
│   ├── api.py                # Central REST router for HTTP & AWS Lambda events
│   └── server.py             # Built-in lightweight HTTP server for local development
├── tests/
│   ├── __init__.py
│   ├── test_backend.py       # Core unit & lifecycle invariants test suite (9 tests)
│   └── test_phase2_integration.py # End-to-end API router integration suite (12 tests)
├── lambda_function.py        # AWS Lambda proxy handler
├── requirements.txt          # Production dependencies
└── README.md                 # Architecture and operations guide
```

---

## 3. Local Development Setup

### A. Run the Authoritative Python Server
No heavy external application servers are required for local development. The project includes a standard-library `ThreadingHTTPServer` configured in `backend/app/server.py` and wrapped by `run_backend.py`.

```bash
# From the project root:
python run_backend.py
```
This starts the backend on `http://127.0.0.1:8000`.

### B. Run the Frontend with Vite Proxy
The development server in `vite.config.js` proxies all `/api` requests directly to `http://127.0.0.1:8000`:

```bash
npm run dev
```

The frontend client in `src/services/apiClient.js` automatically manages JWT authentication tokens and attaches them to all outgoing requests.

---

## 4. Multi-Tenant Persistence

The storage layer implements the `BaseRepository` interface with strict `org_id` boundaries:

1. **`JsonFileRepository` (Active Locally)**:
   - Stores tenant data inside `db.json`.
   - Used by default during local development (`DATA_BACKEND=file`).
   - Automatically seeds default administrators, technicians, and campus users if the database is uninitialized.

2. **`DynamoDBRepository` (AWS Cloud-Ready)**:
   - Fully implemented enterprise single-table design.
   - Partition Key: `PK = ORG#<org_id>` for hard physical data isolation.
   - Sort Keys:
     - `USER#<user_id>`
     - `TICKET#<ticket_id>`
     - `AUDIT#<timestamp>#<audit_id>`
   - Global Secondary Index (GSI): `GSI1PK = EMAIL#<email>` for fast $O(1)$ user authentication queries.
   - Activated in AWS environments by setting `DATA_BACKEND=dynamodb` and `DYNAMODB_TABLE_NAME=<table-name>`.

---

## 5. Security & Authentication Guardrails

- **Cryptographic Password Security**: Passwords are hashed using salted PBKDF2-SHA256 with 100,000 rounds. Legacy plaintext passwords and insecure fallbacks have been completely removed.
- **Mandatory Expiration (`exp`)**: Every JWT token requires an explicit expiration claim. Expired or forged tokens are rejected immediately with `HTTP 401`.
- **Amazon Cognito Integration**: Seamlessly validates Cognito ID and Access tokens by verifying issuer (`iss`), audience/client ID (`aud`/`client_id`), and token usage claims.
- **Login Rate Limiting**: Enforces a strict threshold of 5 failed login attempts per 15-minute sliding window per identifier, returning `HTTP 429 Too Many Requests`.
- **Generic Auth Failures**: Invalid credentials return a generic `Invalid email or password.` message to prevent account enumeration.
- **Production Guardrails**: In production (`ENVIRONMENT=production`), the application terminates immediately on startup if a default or insecure `JWT_SECRET` is detected.
- **Credential Segregation**: All third-party credentials (`GEMINI_API_KEY`, `PINECONE_API_KEY`, `AIRTABLE_API_KEY`) reside exclusively in server-side environment variables and are never bundled into client assets.

---

## 6. Authoritative State Machine & Anti-Impersonation

The ticket lifecycle strictly enforces dual approval:

```
[Open / Assigned] 
       │
       ▼ (Tech starts work / claims ticket)
[In Progress]
       │
       ▼ (Assigned Tech submits repair with resolutionNotes)
[Pending User Verification]
       │
       ├──► (Consumer confirms repair on site) ──► [Completed] ──► Ingest to Trusted RAG
       │
       └──► (Consumer rejects repair with rejectionReason) 
                   │
                   ▼ (Reopen count increments, techConfirmed resets)
             [In Progress]
```

- **No Direct Jump to Completed**: Any attempt to set status directly to `Completed` via `PATCH /status` is rejected with `HTTP 400 Bad Request`.
- **Anti-Impersonation for Tech Confirmation**: Only the technician assigned to the ticket can call `/tech-complete`. Administrators and other technicians cannot impersonate this confirmation.
- **Anti-Impersonation for Consumer Verification & Rejection**: Only the original reporting consumer can call `/verify-closure` or `/reject-closure`. Administrators and other users are blocked.
- **Consumer Rejection Tracking**: Consumer rejection mandates a `rejectionReason`, increments `reopenCount`, and preserves the original ticket identifier.

---

## 7. REST API Reference

All protected routes mandate `Authorization: Bearer <jwt_token>`.

### Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate user, returns JWT and user profile |
| `POST` | `/api/v1/auth/register` | Register new user/technician (pending admin approval) |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |

### Administration (Admin Only)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/users` | List tenant users and pending registrations |
| `POST` | `/api/v1/admin/users/:id/approve` | Approve a pending user account |
| `POST` | `/api/v1/admin/users/:id/reject` | Reject a pending user account |
| `GET` | `/api/v1/audit-logs` | Retrieve tenant audit logs (returns `auditLogs` & `audit_logs`) |

### Work Orders / Tickets
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/tickets` | List tenant tickets scoped to caller's role (supports `?queue=claimable` vs `?queue=assigned`) |
| `GET` | `/api/v1/tickets/claimable` | Unassigned tickets eligible for caller's specialty |
| `POST` | `/api/v1/tickets` | Create work order (with photo, magic byte validation, AI triage, safety override) |
| `POST` | `/api/v1/tickets/:id/claim` | Atomic technician claim with specialty & workload checks |
| `GET` | `/api/v1/tickets/:id` | Get work order details (scoped to owner/assignee/admin) |
| `PATCH` | `/api/v1/tickets/:id/status` | Authoritative status transition with optimistic concurrency |
| `POST` | `/api/v1/tickets/:id/tech-complete` | Tech marks complete with `{ resolutionNotes, version }` |
| `POST` | `/api/v1/tickets/:id/verify-closure`| Consumer confirms physical fix with version check; closes ticket |
| `POST` | `/api/v1/tickets/:id/reject-closure`| Consumer rejects fix with `{ rejectionReason, version }` |
| `DELETE`| `/api/v1/tickets/:id` | Delete ticket (Admin or reporter only) |

### Uploads & Storage
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/uploads/presign` | Request presigned S3 upload URL with MIME & size validation |

---

## 8. Test Suite & Verification

The test suite runs under the Python standard library `unittest` framework:

```bash
# Run all 33 unit, integration, and security tests:
python -m unittest discover -s backend/tests -p "test_*.py" -v
```

The 33 tests validate:
- **Phase 1 Invariants**: Public admin registration block, multi-tenant isolation, unassigned technician completion prevention, state machine dual confirmation, consumer rejection reopen, deterministic safety escalation, RAG gating, and PBKDF2 hashing.
- **Phase 2 Router Invariants**: Unauthenticated request rejection (`401`), consumer and technician access isolation (`403`), anti-impersonation checks (`403`), rejection reason persistence, direct transition to Completed block (`400`), cross-tenant audit isolation, and JWT signature verification.
- **Phase 3 Production Security & Concurrency**:
  - Cryptographic RS256 signature verification for Amazon Cognito JWKS.
  - Forged Cognito JWT rejection.
  - Mismatched issuer (`iss`) and audience (`aud`/`client_id`) rejection.
  - Expired Cognito token rejection.
  - Missing organisation membership rejection.
  - Two simultaneous technician claims returning HTTP 409 Conflict.
  - Two simultaneous confirmation requests returning HTTP 409 Conflict.
  - Version conflict detection returning HTTP 409 Conflict.
  - Cross-tenant ticket access blockage.
  - Technician skill restrictions (general technician blocked from specialized tickets).
  - Server-side image magic bytes and MIME validation.

---

## 9. AWS Lambda & API Gateway Deployment

### Packaging
```bash
# 1. Prepare deployment package directory
mkdir package
pip install -r backend/requirements.txt -t package/
cp -r backend/app package/
cp backend/lambda_function.py package/

# 2. Create deployment zip
cd package
zip -r ../smartfix_backend.zip .
cd ..
```

### AWS Deployment Steps:
1. **AWS Lambda**:
   - Runtime: Python 3.11
   - Handler: `lambda_function.lambda_handler`
   - Memory: 512 MB, Timeout: 30 seconds
2. **Environment Variables**:
   - `ENVIRONMENT=production`
   - `JWT_SECRET=<secure-random-64-char-string>`
   - `DATA_BACKEND=dynamodb`
   - `DYNAMODB_TABLE_NAME=SmartFixMaintenance`
   - `GEMINI_API_KEY=<gemini-api-key>`
3. **Amazon API Gateway**:
   - Create an HTTP API with a catch-all route: `ANY /{proxy+}`
   - Integration: AWS Lambda proxy integration pointing to your function
   - Enable CORS with allowed origins, headers (`Content-Type,Authorization`), and methods (`GET,POST,PUT,PATCH,DELETE,OPTIONS`).
