# SmartFix AI — Secure Backend Foundation (Phase 1)

This directory contains the authoritative Python backend for **SmartFix AI**, implementing enterprise multi-tenancy, strict organization data isolation, cryptographically secure authentication, dual-approval state machine enforcement, and trusted RAG ingestion.

---

## 1. Modular Architecture Overview

```
backend/
├── app/
│   ├── __init__.py           # Package definition
│   ├── config.py             # Centralized environment variables, defaults & constants
│   ├── models.py             # Domain models, TicketStatus, UserRole, Specialty
│   ├── auth.py               # PBKDF2-SHA256 password hashing (100k rounds), JWT verification
│   ├── storage.py            # Multi-tenant repository with strict org_id boundary isolation
│   ├── lifecycle.py          # State machine, safety overrides, dual-approval, consumer reopen
│   ├── rag.py                # Semantic embeddings (text-embedding-004), trusted completed ingestion
│   ├── ai.py                 # Multimodal Gemini 1.5 vision triage & Open-Meteo weather context
│   ├── audit.py              # Immutable audit logging service
│   └── api.py                # REST API router & AWS API Gateway proxy handler
├── tests/
│   ├── __init__.py
│   └── test_backend.py       # 9 comprehensive authorization & workflow unit tests
├── lambda_function.py        # AWS Lambda entrypoint adapting API Gateway events to app.api
└── requirements.txt          # Python runtime dependencies
```

---

## 2. Core Security & Workflow Invariants

1. **Derived Identity Claims**:
   - The backend never trusts client-supplied `user_id`, `org_id`, or `role` fields.
   - All claims are derived strictly from cryptographically verified JWT bearer tokens (`AuthenticatedUser`).
2. **Public Admin Registration Block**:
   - Public registration endpoints reject `admin` role requests (`HTTP 403 Forbidden`). Administrator accounts can only be created by an existing authenticated administrator or seeded securely.
3. **Multi-Tenant Organization Boundary**:
   - Every user, technician, ticket, repair record, and audit log belongs to an `org_id`.
   - Queries and mutations across different organizations are strictly prohibited and isolated.
4. **Deterministic Safety-Critical Priority Overrides**:
   - High-risk hazards (natural gas leaks, electrical sparking, active fires, live high-voltage conductors, structural collapse) automatically clamp urgency to `Emergency`, set `isHazard: true`, and force `priorityScore >= 95`.
   - These overrides cannot be downgraded by client input or heuristic AI triage.
5. **Authoritative Dual Approval**:
   - Work orders cannot jump directly to `Completed`.
   - A ticket transitions from `Assigned` / `In Progress` $\rightarrow$ `Pending User Verification` only when the assigned field technician completes work and supplies repair resolution notes.
   - The ticket transitions to `Completed` only when the reporting consumer verifies and confirms the repair.
   - If the consumer rejects the repair, a mandatory rejection reason is required, and the ticket is immediately reopened back to `In Progress`.
6. **Trusted RAG Ingestion Gating**:
   - Unverified complaints or ongoing repairs are never ingested into vector knowledge.
   - Only tickets with verified dual approval (`status == Completed`, `techConfirmed == True`, `userConfirmed == True`) are embedded and ingested into Pinecone / historical memory.
7. **Immutable Audit Trail**:
   - Every registration, approval, ticket creation, status update, dual sign-off, rejection, and deletion produces an immutable audit record with timestamps, actors, targets, and metadata.

---

## 3. Environment Variables

Configure these in AWS Lambda under **Configuration $\rightarrow$ Environment variables**, or in your local `.env`:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secret key used for signing and verifying JWT tokens | *(Required in Production)* |
| `JWT_EXPIRATION_HOURS` | Lifetime of issued JWT tokens | `24` |
| `DATA_BACKEND` | Storage backend driver (`file` or `memory`) | `file` |
| `DB_FILE_PATH` | Path to persistent JSON database | `db.json` |
| `GEMINI_API_KEY` | Google AI Studio API Key for multimodal triage & embeddings | *(Optional / Server-side)* |
| `PINECONE_API_KEY` | Pinecone Serverless API Key for vector RAG | *(Optional / Server-side)* |
| `PINECONE_INDEX_NAME` | Pinecone index name | `fixflow-maintenance-tickets` |
| `AIRTABLE_API_KEY` | Optional Airtable sync token | *(Optional / Server-side)* |
| `AIRTABLE_BASE_ID` | Optional Airtable Base ID | `app32PCGpVp4lBamC` |
| `AIRTABLE_TABLE_NAME` | Optional Airtable Table Name | `tblyhV3Zxyw2wWzww` |

---

## 4. REST API Reference

All requests expect `Authorization: Bearer <jwt_token>` except public auth endpoints.

### Authentication Endpoints
- `POST /api/v1/auth/register` — Register a new `user` or `technician` account (gated by admin approval).
- `POST /api/v1/auth/login` — Authenticate using email and password, returning JWT access token.
- `GET /api/v1/auth/me` — Return verified claims of current user.

### Admin Endpoints
- `GET /api/v1/admin/pending-users` — Retrieve users awaiting registration approval.
- `POST /api/v1/admin/approve-user` — Approve a pending account.
- `POST /api/v1/admin/reject-user` — Reject and remove a pending registration.
- `GET /api/v1/audit-logs` — Retrieve immutable audit trail for the tenant organisation.

### Ticket Lifecycle Endpoints
- `GET /api/v1/tickets` — List organisation-isolated tickets (filtered by department for technicians).
- `POST /api/v1/tickets` — Create a work order with AI triage, weather context, and safety overrides.
- `GET /api/v1/tickets/:id` — Get ticket details.
- `POST /api/v1/tickets/:id/tech-complete` — Technician submits repair notes and marks fixed (`Pending User Verification`).
- `POST /api/v1/tickets/:id/verify-closure` — Consumer verifies physical repair and completes ticket (triggers RAG ingestion).
- `POST /api/v1/tickets/:id/reject-closure` — Consumer rejects repair with reason; reopens ticket to `In Progress`.
- `POST /api/v1/tickets/:id/status` — State machine transition (e.g. `In Progress`).
- `DELETE /api/v1/tickets/:id` — Delete a work order (Admin or reporter only).

---

## 5. Verification & Testing

Run the Python unit and authorization test suite:

```bash
python -m unittest discover -s backend/tests -p "test_*.py" -v
```

All 9 tests verify:
- Public admin registration blockage.
- Cross-tenant organization data isolation.
- Unassigned technician work order sign-off prevention.
- Direct jump to `Completed` transition rejection.
- Dual-approval completion.
- Consumer rejection reopening with mandatory reason.
- Deterministic safety hazard auto-escalation.
- Unverified ticket RAG ingestion rejection.
- Salted PBKDF2 password hashing verification.

---

## 6. AWS Lambda Deployment

### Packaging:
```bash
pip install -r requirements.txt -t package/
cp -r app package/
cp lambda_function.py package/
cd package && zip -r ../smartfix_backend.zip . && cd ..
```

1. Create a Lambda function with runtime **Python 3.11**.
2. Set the handler to `lambda_function.lambda_handler`.
3. Configure an **API Gateway HTTP API** proxying all routes (`ANY /{proxy+}`) to the Lambda function.
4. Configure required environment variables (`JWT_SECRET`, `GEMINI_API_KEY`, etc.).
