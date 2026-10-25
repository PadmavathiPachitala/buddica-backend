# Fintech Wallet & RBAC API

A robust, production-grade RESTful API engineered for digital wallet management, role-based access control (RBAC), atomic peer-to-peer balance transfers, and tamper-resistant administrative audit logging. Developed as a 48-hour technical assessment for **Buddica Global Solutions Pvt. Ltd.**

> **Disclaimer:** This project is a backend technical evaluation assignment. It provides a simulated digital wallet ledger and does not connect to real-world banking infrastructure, card payment gateways (such as Razorpay or Stripe), or move real fiat currency.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Technology Stack](#technology-stack)
4. [Architecture & Request Flow](#architecture--request-flow)
5. [Project Folder Structure](#project-folder-structure)
6. [Roles & Permissions Matrix](#roles--permissions-matrix)
7. [API Reference & Endpoint Documentation](#api-reference--endpoint-documentation)
8. [Database Design & Data Models](#database-design--data-models)
9. [Authentication & Security Controls](#authentication--security-controls)
10. [Wallet Transfer & Transaction Safety](#wallet-transfer--transaction-safety)
11. [Environment Configuration](#environment-configuration)
12. [Installation & Local Setup](#installation--local-setup)
13. [Testing](#testing)
14. [Postman API Testing](#postman-api-testing)
15. [Assignment Deliverables](#assignment-deliverables)
16. [License & Author](#license--author)

---

## Project Overview

The **Fintech Wallet & RBAC API** is a secure financial backend service designed to solve common ledger consistency challenges, access-control boundaries, and high-concurrency race conditions.

Key engineering objectives achieved in this system:
- **Integer Minor-Unit Financial Computation:** Eliminates IEEE 754 floating-point rounding errors by representing all monetary values strictly as integers in paise (`1 INR = 100 paise`).
- **Strict Role-Based Access Control (RBAC):** Live database verification on every protected request prevents privilege escalation and guarantees that administrative role updates take effect immediately without waiting for JWT expiration.
- **Double-Entry Balance Transfers:** Peer-to-peer money transfers execute atomically across sender and recipient balances, accompanied by an immutable transaction ledger.
- **Transfer Idempotency:** Full protection against duplicate debits from network retries and duplicate button clicks via client-supplied idempotency keys enforced by a unique database index.
- **Administrative Audit Logging:** Mandatory structured audit trail recording actor identity, action type, target resource, state diffs, client IP, user-agent, and human justification reason for all administrative overrides.

---

## Key Features

### Implemented Features

| Feature | Description | Implementation Status |
| :--- | :--- | :---: |
| **Customer Registration & Login** | Public registration auto-assigns `customer` role and creates an initialized wallet. Login returns a signed JWT. | Verified |
| **JWT Authentication** | Stateless token issuance with HMAC SHA-256 (`HS256`), configurable expiry, and subject claim (`sub`). | Verified |
| **Password Hashing** | Strong `bcryptjs` hashing with 12 salt rounds, protected by UTF-8 byte length limits (`<= 72 bytes`). | Verified |
| **Authenticated User Profile** | Identity verification endpoint (`GET /api/auth/me`) reading live context from MongoDB. | Verified |
| **Wallet Balance Inspection** | Customer balance inspection (`GET /api/wallet`) scoped strictly to the authenticated user's session (IDOR-immune). | Verified |
| **Wallet-to-Wallet Transfers** | Peer-to-peer balance transfer (`POST /api/wallet/transfer`) with balance validation, self-transfer blocking, and recipient role verification. | Verified |
| **Customer Transaction Ledger** | Paginated transaction history (`GET /api/wallet/transactions`) with directional labels (`debit` vs `credit`) and status filters. | Verified |
| **Cross-User Transaction Inspection** | Centralized ledger review (`GET /api/admin/transactions`) for Support and Admin roles with filtering by date, user, and status. | Verified |
| **Administrative User Directory** | Paginated user directory (`GET /api/admin/users`) with role filtering, active status filtering, and regex text search. | Verified |
| **Role Management with Safeguards** | Administrative role updating (`PATCH /api/admin/users/:userId/role`) with self-demotion prevention and last-active-admin protection. | Verified |
| **Transaction State Machine** | Status updates (`PATCH /api/admin/transactions/:transactionId/status`) enforcing valid transitions, terminal state protection, and financial reversals. | Verified |
| **Immutable Audit Logging** | Dedicated `AuditLog` collection capturing actor, action, target resource, reason, IP address, and user-agent. | Verified |
| **Input Validation & JSend Responses** | Strict validation of payload boundaries, rejection of unauthorized body parameters, and standardized `{ status, data }` response contracts. | Verified |
| **Security Middleware** | HTTP header hardening via Helmet, CORS protection, and IP-based rate limiting on `/register` and `/login`. | Verified |
| **Concurrency & Overdraft Protection** | Atomic conditional queries (`{ balance: { $gte: amount } }`) guarantee that wallet balances can never drop below zero. | Verified |
| **Transfer Idempotency** | Compound unique sparse database index `{ idempotencyKey: 1, senderId: 1 }` prevents duplicate debits during concurrent retries. | Verified |
| **Automated Test Suite** | 53 unit tests across 14 suites and integration tests using Node.js native test runner (`node:test`). | Verified |
| **Database Isolation Guard** | Automatic safeguard (`testDbGuard.js`) aborting tests if test database URI matches development database. | Verified |

### Partially Implemented / Intentionally Omitted Features

| Feature | Status | Engineering Rationale |
| :--- | :---: | :--- |
| **External Payment Gateway** | Not Implemented | Backend assignment requirement; simulated internal balance transfers only. |
| **Multi-Currency FX Support** | Not Implemented | Fixed to Indian Rupee (`INR` in paise). Multi-currency ledgers require live exchange rates and multi-currency wallets. |
| **Distributed Rate Limiting** | Partially Implemented | Rate limiting uses `express-rate-limit` with an in-memory store. In a multi-instance production cluster, a Redis store is recommended. |
| **Replica-Set Transaction Dependency** | Implementation Note | Multi-document ACID transactions require MongoDB running as a replica set (`rs0`). On standalone MongoDB, the service falls back to atomic conditional operations with compensating rollback. |

---

## Technology Stack

| Technology | Dependency / Version | Purpose | Usage in this Project |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (Tested on v22) | JavaScript runtime environment | Executes the backend server, asynchronous services, and native test runners. |
| **Express.js** | `express@^5.3.0` | Web application framework | Handles HTTP routing, middleware pipelines, error handling, and JSON parsing. |
| **MongoDB** | `>= 6.0` (Replica set recommended) | Document-oriented NoSQL database | Stores persistent user accounts, wallets, double-entry transactions, and audit logs. |
| **Mongoose** | `mongoose@^9.11.3` | Object Data Modeling (ODM) library | Manages schemas, validation, unique indexes, model hooks, and database sessions. |
| **JSON Web Token** | `jsonwebtoken@^9.0.3` | Stateless authentication tokens | Signs and verifies secure JWT bearer tokens containing the authenticated user ID (`sub`). |
| **bcryptjs** | `bcryptjs@^3.0.3` | Password hashing function | Hashes user passwords with 12 salt rounds and verifies credentials during login. |
| **dotenv** | `dotenv@^18.0.9` | Environment variable loader | Loads configuration variables from `.env` into `process.env` at startup. |
| **Helmet** | `helmet@^8.3.0` | Security header middleware | Secures Express apps by setting various HTTP response headers against web attacks. |
| **CORS** | `cors@^2.8.6` | Cross-Origin Resource Sharing | Enables and controls cross-origin HTTP requests from client applications. |
| **Express Rate Limit** | `express-rate-limit@^8.7.1` | Request rate limiter | Protects public authentication endpoints against brute-force attacks and abuse. |
| **Node Test Runner** | Built-in `node:test` & `node:assert/strict` | Automated unit & integration testing | Executes test suites with zero external test runner dependencies. |
| **Postman / Thunder Client** | `fintech_api.postman_collection.json` | API testing & exploration tool | Provides automated API test sequences, collection variables, and request templates. |

---

## Architecture & Request Flow

The application follows an enterprise **layered architecture** with strict separation of concerns:

```
[ Client / Postman ]
         │
         ▼
[ Express Router ] ────── (app.js / routes/*.routes.js)
         │
         ▼
[ Rate Limiter ] ──────── (rateLimiter.js on /register & /login)
         │
         ▼
[ Auth Middleware ] ───── (auth.middleware.js: verifies JWT signature & loads active user from DB)
         │
         ▼
[ RBAC Middleware ] ───── (authorize.middleware.js: validates live DB role against route permissions)
         │
         ▼
[ Controller Layer ] ──── (validators/*.validators.js: payload structure & byte length checks)
         │
         ▼
[ Service Layer ] ─────── (business logic, transactions, atomicity, idempotency, audit trail)
         │
         ▼
[ Model Layer ] ───────── (Mongoose schemas, validations, compound unique indexes, serialization)
         │
         ▼
[ MongoDB Database ] ──── (Replica-set ACID transactions / atomic conditional documents)
```

### Authentication & Authorization Pipeline

1. **Authentication Flow (`auth.middleware.js`):**
   - Extracts the `Bearer <token>` from the HTTP `Authorization` header.
   - Verifies the signature and expiration date against `JWT_SECRET` using `HS256`.
   - Extracts the subject claim (`decoded.sub`), which contains the MongoDB `_id`.
   - Queries MongoDB (`User.findById(decoded.sub)`) to ensure the user exists and has not been deactivated (`isActive === true`).
   - Attaches the live Mongoose document to `req.user`.

2. **Authorization Flow (`authorize.middleware.js`):**
   - Inspects the live `req.user.role` from the database context.
   - Compares the role against allowed roles defined on the route (e.g. `authorizeRoles("admin")`).
   - If the role does not match, the request fails closed immediately with `403 Forbidden` without invoking the controller.
   - Any role modification made by an administrator takes effect on the very next request.

### Mermaid Architecture Diagram

```mermaid
flowchart TD
    Client["Client / Postman / Browser"] -->|"HTTP Request"| App["Express App (app.js)"]
    
    subgraph Security_Middleware ["Security & Middleware Layer"]
        App --> Helmet["Helmet (Security Headers)"]
        Helmet --> CORS["CORS Handler"]
        CORS --> RateLimit["Rate Limiter (express-rate-limit)"]
        RateLimit --> AuthMW{"auth.middleware.js"}
        AuthMW -->|"Invalid/Expired Token"| Err401["HTTP 401 Unauthorized"]
        AuthMW -->|"User Inactive"| Err403A["HTTP 403 Forbidden"]
        AuthMW -->|"Valid JWT + Active User"| RBACMW{"authorize.middleware.js"}
        RBACMW -->|"Role Not Permitted"| Err403B["HTTP 403 Forbidden"]
    end

    subgraph Controller_Validation ["Controller & Validation Layer"]
        RBACMW -->|"Role Authorized"| Controller["Controller (Auth / Wallet / Admin)"]
        Controller --> Validator["Input Validators (*.validators.js)"]
        Validator -->|"Invalid Payload"| Err400["HTTP 400 Bad Request"]
    end

    subgraph Service_Business_Logic ["Service Layer (Business Logic)"]
        Validator -->|"Validated Data"| Service["Service (Auth / Wallet / Admin)"]
        Service -->|"Idempotency Check"| IdemCheck{"Idempotency Key Exists?"}
        IdemCheck -->|"Yes (Duplicate)"| ReturnCached["Return Stored Transaction (200 OK)"]
        IdemCheck -->|"No (New Request)"| TxBoundary["Transaction Boundary"]
    end

    subgraph Database_Layer ["Database Layer (MongoDB)"]
        TxBoundary -->|"Replica Set"| MongoSession["session.withTransaction() (ACID)"]
        TxBoundary -->|"Standalone Fallback"| AtomicCond["Atomic $gte Conditional + Compensation"]
        MongoSession --> UserColl[("Users Collection")]
        MongoSession --> WalletColl[("Wallets Collection")]
        MongoSession --> TxColl[("Transactions Collection")]
        MongoSession --> AuditColl[("AuditLogs Collection")]
        AtomicCond --> WalletColl
        AtomicCond --> TxColl
    end

    Controller -->|"JSend Response"| Client
```

---

## Project Folder Structure

```text
fintech-assesment/
├── src/
│   ├── app.js                          # Express application setup, security headers & routing pipeline
│   ├── config/
│   │   ├── db.js                       # Resilient Mongoose database connection with DNS fallback
│   │   └── env.js                      # Environment variable validation & configuration loader
│   ├── controllers/
│   │   ├── admin.controller.js         # User listing, role updates, transaction search & status changes
│   │   ├── auth.controller.js          # Customer registration, login & authenticated profile retrieval
│   │   └── wallet.controller.js        # Wallet balance, fund transfers & personal transaction history
│   ├── middleware/
│   │   ├── auth.middleware.js          # JWT authentication, token verification & live user loading
│   │   ├── authorize.middleware.js     # Live database role-based access control (RBAC) guard
│   │   ├── errorHandler.js             # Centralized error handler returning standard JSend formats
│   │   ├── notFound.js                 # 404 Not Found route handler
│   │   └── rateLimiter.js              # Rate limiters for login, registration & test configurations
│   ├── models/
│   │   ├── auditLog.model.js           # Mongoose schema for immutable administrative audit trails
│   │   ├── transaction.model.js        # Ledger schema with compound unique idempotency indexes
│   │   ├── user.model.js               # User accounts schema, bcrypt verification & safe serialization
│   │   └── wallet.model.js             # Wallet balance tracking in integer paise (1:1 per customer)
│   ├── routes/
│   │   ├── admin.routes.js             # Administrative and support endpoints (/api/admin)
│   │   ├── auth.routes.js              # Authentication endpoints (/api/auth)
│   │   └── wallet.routes.js            # Customer wallet endpoints (/api/wallet)
│   ├── scripts/
│   │   ├── init-replica.js             # Helper script to initialize a local single-node replica set
│   │   └── seed.js                     # Idempotent database seeder for default Admin and Support accounts
│   ├── services/
│   │   ├── admin.service.js            # User management, transaction audits, state machine & reversals
│   │   ├── auth.service.js             # Registration, credential verification, JWT signing & user lookup
│   │   └── wallet.service.js           # Atomic balance transfers, idempotency handling & ledger queries
│   ├── utils/
│   │   └── AppError.js                 # Custom operational error class with HTTP status codes
│   └── validators/
│       ├── admin.validators.js         # Input validation for role changes and transaction status changes
│       ├── auth.validators.js          # Input validation for registration & login (72-byte password bounds)
│       └── wallet.validators.js        # Input validation for transfers, integer paise amounts & recipients
├── tests/
│   ├── helpers/
│   │   └── testDbGuard.js              # Database isolation guard preventing tests on production/dev DBs
│   ├── integration/
│   │   ├── admin.api.test.js           # End-to-end integration tests for admin & support operations
│   │   ├── auth.api.test.js            # End-to-end integration tests for registration, login & auth
│   │   ├── rateLimiter.test.js         # Integration tests for IP rate limiting thresholds
│   │   ├── rbac.api.test.js            # Cross-role permission & forbidden access tests
│   │   ├── transfer.api.test.js        # Integration tests for transfers, concurrency & idempotency
│   │   └── wallet.api.test.js          # Integration tests for wallet balances & customer ledger
│   └── unit/
│       ├── admin.service.test.js       # Unit tests for admin safeguards and state-machine transitions
│       ├── admin.validators.test.js    # Unit tests for role and status change payload validators
│       ├── app.test.js                 # Unit tests for health check, Helmet headers & CORS
│       ├── auth.validators.test.js     # Unit tests for registration & login validators (byte length checks)
│       ├── authorize.middleware.test.js# Unit tests for RBAC role enforcement & fail-closed behavior
│       ├── dbGuard.test.js             # Unit tests for testDbGuard URI parsing and collision detection
│       ├── user.model.test.js          # Unit tests for User password comparison & JSON serialization
│       └── wallet.service.test.js      # Unit tests for transfer idempotency & standalone fallback
├── .env.example                        # Template environment configuration file with safe placeholders
├── AI_Usage_Summary_Sheet.md           # Declaration of AI assistance and manual implementation ownership
├── fintech_api.postman_collection.json # Exportable Postman / Thunder Client collection with variables
├── package.json                        # Node.js project manifest, dependencies & scripts
├── README.md                           # System documentation, design decisions & runbook
└── server.js                           # HTTP server bootstrap & graceful shutdown handler
```

---

## Roles & Permissions Matrix

The system implements three mutually distinct roles:

1. **Customer:** Standard platform user. Can manage personal wallet balance, initiate transfers to other customers, and inspect personal transaction history. Cannot access administrative endpoints.
2. **Support:** Customer service staff. Read-only access to inspect global transactions across all customers to assist with dispute resolution. Cannot view user lists, modify user roles, alter transaction statuses, or initiate wallet transfers.
3. **Admin:** System administrator. Full operational control over user listings, role assignments, transaction status overrides, financial reversals, and audit logs. Barred from initiating customer wallet transfers.

### Permissions Matrix

| Action / Capability | Endpoint | Customer | Support Staff | Administrator |
| :--- | :--- | :---: | :---: | :---: |
| **Public Registration** | `POST /api/auth/register` | Allowed (Auto `customer`) | Blocked | Blocked |
| **Authentication & Login** | `POST /api/auth/login` | Allowed | Allowed | Allowed |
| **View Own Profile** | `GET /api/auth/me` | Allowed | Allowed | Allowed |
| **View Own Wallet Balance** | `GET /api/wallet` | Allowed | Blocked (`403`) | Blocked (`403`) |
| **Transfer Balance to Customer** | `POST /api/wallet/transfer` | Allowed | Blocked (`403`) | Blocked (`403`) |
| **View Own Transaction History** | `GET /api/wallet/transactions` | Allowed | Blocked (`403`) | Blocked (`403`) |
| **Inspect Cross-User Transactions** | `GET /api/admin/transactions` | Blocked (`403`) | Allowed | Allowed |
| **List & Search Platform Users** | `GET /api/admin/users` | Blocked (`403`) | Blocked (`403`) | Allowed |
| **Modify User Roles** | `PATCH /api/admin/users/:userId/role` | Blocked (`403`) | Blocked (`403`) | Allowed (Safeguarded) |
| **Update Transaction Status** | `PATCH /api/admin/transactions/:id/status` | Blocked (`403`) | Blocked (`403`) | Allowed (State machine) |
| **View Administrative Audit Logs** | `GET /api/admin/audit-logs` | Blocked (`403`) | Blocked (`403`) | Allowed |

### Disclosure of Implementation Discrepancies

- **Administrative Accounts Have No Wallets:** Wallets are automatically created exclusively for users registered with the `customer` role. Admin and Support accounts seeded into the database do not have wallet documents, and their roles are explicitly forbidden from invoking `/api/wallet/*` endpoints.
- **Support Staff Cannot Initiate Transfers:** In strict compliance with financial security segregation of duties, Support staff have read-only visibility into transaction records and cannot transfer balances.
- **Admin Self-Demotion & Last-Admin Protection:** An administrator is blocked from demoting their own account or demoting the last active administrator on the platform.

---

## API Reference & Endpoint Documentation

All API responses follow the **JSend specification**:
- Success: `{ "status": "success", "data": { ... } }`
- Operational Failure: `{ "status": "fail", "message": "Detailed description" }`
- Internal Server Error: `{ "status": "error", "message": "Something went wrong" }`

### Endpoints Summary Table

| Method | Endpoint | Required Role | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System uptime, health metrics, and timestamp |
| `POST` | `/api/auth/register` | Public (Rate Limited) | Register a new customer account and initialize a wallet |
| `POST` | `/api/auth/login` | Public (Rate Limited) | Authenticate user credentials and issue a JWT |
| `GET` | `/api/auth/me` | Authenticated (Any role) | Retrieve authenticated user profile |
| `GET` | `/api/wallet` | `customer` | Retrieve customer's wallet balance in paise |
| `POST` | `/api/wallet/transfer` | `customer` | Execute atomic fund transfer between customers |
| `GET` | `/api/wallet/transactions` | `customer` | Retrieve paginated transaction history for caller |
| `GET` | `/api/admin/users` | `admin` | Search and filter platform user accounts |
| `PATCH` | `/api/admin/users/:userId/role` | `admin` | Update user role with mandatory audit justification |
| `GET` | `/api/admin/transactions` | `support`, `admin` | Search and review transactions across all users |
| `PATCH` | `/api/admin/transactions/:transactionId/status` | `admin` | Transition transaction status or execute reversal |
| `GET` | `/api/admin/audit-logs` | `admin` | Retrieve immutable administrative audit trail |

---

### Detailed Endpoint Specifications

#### 1. System Health Check
- **`GET /health`**
- **Access:** Public
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "uptime": 124.58,
    "timestamp": "2026-10-25T12:00:00.000Z"
  }
  ```

#### 2. Customer Registration
- **`POST /api/auth/register`**
- **Access:** Public (Rate limit: 10 requests / hour per IP)
- **Request Body:**
  ```json
  {
    "name": "Alice Sharma",
    "email": "alice@example.com",
    "password": "Password123!"
  }
  ```
- **Validation Rules:**
  - `name`: String, 2 to 50 characters.
  - `email`: Valid email format, normalized to lowercase.
  - `password`: String, minimum 8 characters, maximum 72 bytes, must include at least one letter and one number.
  - Forbidden fields: Supplying `role`, `isActive`, or `passwordHash` returns `400 Bad Request`.
- **Success Response (`201 Created`):**
  ```json
  {
    "status": "success",
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "671b56a1e502123456789abc",
        "name": "Alice Sharma",
        "email": "alice@example.com",
        "role": "customer",
        "isActive": true,
        "createdAt": "2026-10-25T12:01:00.000Z",
        "updatedAt": "2026-10-25T12:01:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NzFiNTZhMWU1MDIxMjM0NTY3ODlhYmMiLCJpYXQiOjE3Mjk4NTc2NjAsImV4cCI6MTcyOTk0NDA2MH0.sample_signature"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Payload validation failure or forbidden field supplied.
  - `409 Conflict`: Email address already registered.
  - `429 Too Many Requests`: Registration rate limit exceeded.

#### 3. User Login
- **`POST /api/auth/login`**
- **Access:** Public (Rate limit: 5 requests / 15 minutes per IP)
- **Request Body:**
  ```json
  {
    "email": "alice@example.com",
    "password": "Password123!"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "message": "Login successful",
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "671b56a1e502123456789abc",
        "name": "Alice Sharma",
        "email": "alice@example.com",
        "role": "customer",
        "isActive": true,
        "createdAt": "2026-10-25T12:01:00.000Z",
        "updatedAt": "2026-10-25T12:01:00.000Z"
      }
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Invalid email or password.
  - `403 Forbidden`: Account is deactivated (`isActive: false`).

#### 4. View Authenticated Profile
- **`GET /api/auth/me`**
- **Access:** Authenticated (`Bearer <token>`)
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "671b56a1e502123456789abc",
        "name": "Alice Sharma",
        "email": "alice@example.com",
        "role": "customer",
        "isActive": true,
        "createdAt": "2026-10-25T12:01:00.000Z",
        "updatedAt": "2026-10-25T12:01:00.000Z"
      }
    }
  }
  ```

#### 5. Get Customer Wallet Balance
- **`GET /api/wallet`**
- **Access:** Customer only (`role: customer`)
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "wallet": {
        "walletId": "671b56a1e502123456789def",
        "balance": 50000,
        "currency": "INR",
        "updatedAt": "2026-10-25T12:05:00.000Z"
      }
    }
  }
  ```
  *(Note: `50000` paise represents ₹500.00 INR)*

#### 6. Wallet-to-Wallet Transfer
- **`POST /api/wallet/transfer`**
- **Access:** Customer only (`role: customer`)
- **Headers:**
  - `Authorization: Bearer <customerToken>`
  - `Idempotency-Key: tx-idem-unique-12345` *(Optional but recommended)*
- **Request Body:**
  ```json
  {
    "receiverId": "671b56b2e502987654321fed",
    "amount": 2500,
    "description": "Lunch reimbursement"
  }
  ```
- **Validation Rules:**
  - `receiverId`: Valid MongoDB ObjectId, must not match caller's own ID, must belong to an active user with `role: "customer"`.
  - `amount`: Positive integer in paise (`1` to `10000000` paise = max ₹1,00,000 INR). Floats or non-integers are rejected.
  - `description`: Optional string, maximum 200 characters.
- **Success Response (`201 Created`):**
  ```json
  {
    "status": "success",
    "data": {
      "transaction": {
        "id": "671b57c3e502555555555555",
        "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "senderId": "671b56a1e502123456789abc",
        "receiverId": "671b56b2e502987654321fed",
        "amount": 2500,
        "type": "transfer",
        "status": "success",
        "idempotencyKey": "tx-idem-unique-12345",
        "description": "Lunch reimbursement",
        "createdAt": "2026-10-25T12:10:00.000Z",
        "updatedAt": "2026-10-25T12:10:00.000Z"
      },
      "newBalance": 47500
    }
  }
  ```
- **Idempotent Replay Response (`200 OK`):**
  If a request with an identical `Idempotency-Key` and `senderId` is re-sent, the existing transaction record is returned with `"isDuplicate": true` without executing a second debit:
  ```json
  {
    "status": "success",
    "data": {
      "transaction": {
        "id": "671b57c3e502555555555555",
        "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "senderId": "671b56a1e502123456789abc",
        "receiverId": "671b56b2e502987654321fed",
        "amount": 2500,
        "type": "transfer",
        "status": "success",
        "idempotencyKey": "tx-idem-unique-12345"
      },
      "isDuplicate": true
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Self-transfer attempted, recipient inactive/not a customer, invalid/float amount, or insufficient balance.
  - `404 Not Found`: Recipient account does not exist.

#### 7. View Customer's Personal Transaction History
- **`GET /api/wallet/transactions?page=1&limit=10&status=success`**
- **Access:** Customer only (`role: customer`)
- **Query Parameters:**
  - `page`: Integer (default: 1)
  - `limit`: Integer (default: 10, max: 50)
  - `status`: String filter (`pending`, `success`, `failed`, `reversed`, `cancelled`)
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "transactions": [
        {
          "id": "671b57c3e502555555555555",
          "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "senderId": {
            "_id": "671b56a1e502123456789abc",
            "name": "Alice Sharma",
            "email": "alice@example.com"
          },
          "receiverId": {
            "_id": "671b56b2e502987654321fed",
            "name": "Bob Verma",
            "email": "bob@example.com"
          },
          "amount": 2500,
          "type": "transfer",
          "status": "success",
          "direction": "debit",
          "description": "Lunch reimbursement",
          "createdAt": "2026-10-25T12:10:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 10,
        "totalPages": 1
      }
    }
  }
  ```

#### 8. List & Search Users (Admin Only)
- **`GET /api/admin/users?role=customer&isActive=true&search=alice&page=1&limit=20`**
- **Access:** Administrator only (`role: admin`)
- **Query Parameters:** `role`, `isActive`, `search` (matches name or email), `page`, `limit`.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "users": [
        {
          "id": "671b56a1e502123456789abc",
          "name": "Alice Sharma",
          "email": "alice@example.com",
          "role": "customer",
          "isActive": true,
          "createdAt": "2026-10-25T12:01:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 20,
        "totalPages": 1
      }
    }
  }
  ```

#### 9. Modify User Role (Admin Only)
- **`PATCH /api/admin/users/:userId/role`**
- **Access:** Administrator only (`role: admin`)
- **Request Body:**
  ```json
  {
    "role": "support",
    "reason": "Promoted to tier-1 customer dispute handling desk"
  }
  ```
- **Validation Rules:**
  - `role`: One of `customer`, `support`, `admin`.
  - `reason`: String between 3 and 500 characters.
  - Safeguards: Administrator cannot demote their own account away from `admin`. Cannot demote the last active administrator on the system.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "671b56a1e502123456789abc",
        "name": "Alice Sharma",
        "email": "alice@example.com",
        "role": "support",
        "isActive": true
      }
    }
  }
  ```

#### 10. Search Cross-User Transactions (Support & Admin)
- **`GET /api/admin/transactions?status=success&page=1&limit=10`**
- **Access:** Support or Administrator (`role: support` or `role: admin`)
- **Query Parameters:** `status`, `senderId`, `receiverId`, `startDate`, `endDate`, `page`, `limit`.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "transactions": [
        {
          "id": "671b57c3e502555555555555",
          "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "senderId": {
            "_id": "671b56a1e502123456789abc",
            "name": "Alice Sharma",
            "email": "alice@example.com",
            "role": "customer"
          },
          "receiverId": {
            "_id": "671b56b2e502987654321fed",
            "name": "Bob Verma",
            "email": "bob@example.com",
            "role": "customer"
          },
          "amount": 2500,
          "status": "success",
          "createdAt": "2026-10-25T12:10:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 10,
        "totalPages": 1
      }
    }
  }
  ```

#### 11. Update Transaction Status / Reversal (Admin Only)
- **`PATCH /api/admin/transactions/:transactionId/status`**
- **Access:** Administrator only (`role: admin`)
- **URL Parameter:** `transactionId` can be either the UUID string or the MongoDB ObjectId.
- **Request Body:**
  ```json
  {
    "status": "reversed",
    "reason": "Administrative reversal following verified double-charge dispute"
  }
  ```
- **State Machine Safeguards:**
  - Completed transfers (`success`) cannot transition to `failed` or `pending`. They can only transition to `reversed`.
  - When transitioning `success` to `reversed`, the system performs an automated financial refund: recipient wallet is debited by `amount`, and sender wallet is credited by `amount`.
  - If the recipient wallet balance is less than `amount`, the reversal is rejected with `400 Bad Request` (*"Cannot reverse transaction: recipient has insufficient wallet balance"*).
  - Terminal statuses (`failed`, `cancelled`, `reversed`) are strictly immutable and cannot be updated.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "transaction": {
        "id": "671b57c3e502555555555555",
        "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "status": "reversed",
        "amount": 2500,
        "updatedAt": "2026-10-25T12:20:00.000Z"
      }
    }
  }
  ```

#### 12. View Audit Logs (Admin Only)
- **`GET /api/admin/audit-logs?page=1&limit=20`**
- **Access:** Administrator only (`role: admin`)
- **Query Parameters:** `action`, `administrator`, `page`, `limit`.
- **Success Response (`200 OK`):**
  ```json
  {
    "status": "success",
    "data": {
      "auditLogs": [
        {
          "_id": "671b58d4e502777777777777",
          "administrator": {
            "_id": "671b55a0e502000000000001",
            "name": "System Administrator",
            "email": "admin@example.com",
            "role": "admin"
          },
          "action": "TRANSACTION_REVERSAL",
          "targetResource": "Transaction:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          "details": {
            "previousStatus": "success",
            "newStatus": "reversed",
            "amount": 2500,
            "senderId": "671b56a1e502123456789abc",
            "receiverId": "671b56b2e502987654321fed"
          },
          "reason": "Administrative reversal following verified double-charge dispute",
          "ipAddress": "127.0.0.1",
          "userAgent": "PostmanRuntime/7.43.0",
          "createdAt": "2026-10-25T12:20:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 20,
        "totalPages": 1
      }
    }
  }
  ```

---

## Database Design & Data Models

The data layer is implemented using **Mongoose schemas** with strict typing, validations, and indexes.

### 1. User Schema (`src/models/user.model.js`)

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | Required, trim, min: 2, max: 50 | Full name of the user |
| `email` | String | Required, unique, trim, lowercase, index | Normalized unique email address |
| `passwordHash` | String | Required, `select: false` | 12-round bcrypt hash, hidden from queries |
| `role` | String | Enum: `['customer', 'support', 'admin']`, default: `'customer'` | User authorization role |
| `isActive` | Boolean | Default: `true` | Account active state for instant deactivation |
| `timestamps` | Date | `createdAt`, `updatedAt` | Automatic Mongoose timestamps |

**JSON Transformation:** The schema applies a `toJSON` transform that aliases `_id` to `id` and permanently deletes `passwordHash` and `__v` from all serialized responses.

---

### 2. Wallet Schema (`src/models/wallet.model.js`)

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `userId` | ObjectId | Ref: `User`, required, unique, index | Owner of the wallet (enforces 1:1 relationship) |
| `balance` | Number | Required, default: `0`, min: `0`, `validator: Number.isInteger` | Current available balance in integer paise |
| `currency` | String | Required, default: `'INR'`, uppercase, trim | ISO-4217 currency code |
| `timestamps` | Date | `createdAt`, `updatedAt` | Automatic Mongoose timestamps |

**One-Wallet-per-Customer Constraint:** Enforced through a database-level unique index on `userId: { type: ObjectId, unique: true }`. The application guarantees that only users with `role: "customer"` have an associated wallet.

**Integer Minor Units Convention:** To eliminate IEEE 754 floating-point inaccuracies, amounts are stored strictly as integers in paise (`1 INR = 100 paise`). For example, ₹50.00 is stored as `5000`. The schema rejects floating-point numbers via `Number.isInteger`.

---

### 3. Transaction Schema (`src/models/transaction.model.js`)

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `transactionId` | String | Required, unique, index, default: UUID v4 | Immutable public transaction identifier |
| `senderId` | ObjectId | Ref: `User`, required, index | Account debit counterparty |
| `receiverId` | ObjectId | Ref: `User`, required, index | Account credit counterparty |
| `amount` | Number | Required, min: `1`, `validator: Number.isInteger` | Transfer amount in integer paise |
| `type` | String | Enum: `['transfer']`, default: `'transfer'` | Ledger entry type |
| `status` | String | Enum: `['pending', 'success', 'failed', 'reversed', 'cancelled']`, default: `'success'`, index | State-machine status |
| `idempotencyKey` | String | Index, sparse | Client-provided deduplication identifier |
| `description` | String | Trim, max: 200 | Optional payment memo |
| `timestamps` | Date | `createdAt`, `updatedAt` | Automatic Mongoose timestamps |

**Indexes Defined on Transactions:**
1. `{ senderId: 1, createdAt: -1 }`: Fast retrieval of sender transaction history sorted by newest first.
2. `{ receiverId: 1, createdAt: -1 }`: Fast retrieval of recipient transaction history sorted by newest first.
3. `{ idempotencyKey: 1, senderId: 1 }` (`unique: true, sparse: true`): Enforces transfer idempotency per sender at the database engine level.

---

### 4. AuditLog Schema (`src/models/auditLog.model.js`)

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `administrator` | ObjectId | Ref: `User`, required, index | Admin user who performed the action |
| `action` | String | Required, trim, index | Action name (`ROLE_CHANGE`, `TRANSACTION_REVERSAL`, etc.) |
| `targetResource` | String | Required, trim, index | Targeted entity identifier (e.g. `User:<id>` or `Transaction:<uuid>`) |
| `details` | Mixed | Default: `{}` | State diffs (e.g. `previousRole`, `newRole`, `amount`) |
| `reason` | String | Required, trim, min: 3, max: 500 | Mandatory human justification for compliance |
| `ipAddress` | String | Default: `null` | Client IP address of the caller |
| `userAgent` | String | Default: `null` | HTTP User-Agent header of the caller |
| `createdAt` | Date | Automatic timestamp (`updatedAt: false`) | Immutable creation timestamp |

---

## Authentication & Security Controls

### 1. Password Hashing & Byte-Length Protection
- Passwords are encrypted using `bcryptjs` with **12 salt rounds**.
- **72-Byte Truncation Guard:** The Bcrypt algorithm silently truncates passwords after 72 bytes. The input validator calculates `Buffer.byteLength(password, 'utf8')` and rejects any password exceeding 72 bytes. This prevents silent password truncation and eliminates CPU-exhaustion DoS attacks from multi-megabyte payloads.

### 2. JWT Configuration & Token Safety
- Tokens are signed with HMAC SHA-256 (`HS256`) using a strong secret verified on boot (`JWT_SECRET`, minimum 32 characters).
- The token payload contains only the subject claim (`sub: user._id.toString()`). No sensitive claims (such as password hashes, emails, or mutable roles) are stored in the JWT payload.

### 3. Anti-Stale Token Architecture
In traditional stateless JWT setups, a deactivated or demoted user can continue making API calls until token expiry. In this project:
- `auth.middleware.js` queries MongoDB on every authenticated request (`User.findById(decoded.sub)`).
- If the account has been deactivated (`isActive === false`), the request is immediately rejected with `403 Forbidden` (*"Account is inactive. Access denied."*).

### 4. Live RBAC Verification
- `authorize.middleware.js` evaluates `req.user.role` from the freshly queried MongoDB user record.
- Any role change made by an administrator takes effect **immediately** on the user's next request without requiring token re-issuance.
- The middleware **fails closed**: if an endpoint has no roles configured, it denies access with `403 Forbidden`.

### 5. Administrative Safeguards
- **Self-Demotion Prevention:** An administrator cannot demote their own account away from `admin`.
- **Last-Admin Protection:** The system counts active administrators (`role: "admin", isActive: true`) before applying any demotion. If only one active administrator remains, the request is rejected with `400 Bad Request`.

### 6. Defense-in-Depth HTTP Hardening
- **Helmet:** Enables standard HTTP security headers (X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options).
- **CORS:** Configured to control cross-origin requests.
- **Error Sanitization:** Centralized error handling suppresses database stack traces and internal error messages when `NODE_ENV === "production"`.

---

## Wallet Transfer & Transaction Safety

Peer-to-peer wallet transfers require a double-entry update across two separate wallet documents and a ledger record. The system provides multiple layers of safety:

```
[ Transfer Request Initiated ]
            │
            ▼
    [ Idempotency Check ] ─── (Found in DB?) ──► [ Return Cached Tx (200 OK) ]
            │ (No)
            ▼
  [ Recipient Validation ] ── (Active & role === "customer"?)
            │ (Yes)
            ▼
 [ MongoDB Deployment Check ]
      ┌─────┴────────────────────────────────┐
      ▼                                      ▼
[ Replica Set Available ]            [ Standalone Fallback ]
session.startTransaction()           1. Atomic $gte Conditional Debit
  - Conditional Debit Sender         2. Credit Recipient
  - Credit Recipient                 3. Insert Transaction Record
  - Insert Transaction Record        4. Compensating Rollback on Failure
session.commitTransaction()
```

### 1. Pre-Transfer Validation
- **Self-Transfer Guard:** Rejects transfers where `senderId === receiverId` with `400 Bad Request`.
- **Recipient Verification:** Verifies that the recipient exists, is active, and has `role: "customer"`. Transfers to Support or Admin accounts are blocked.
- **Amount Boundary Check:** Rejects negative numbers, zero, floating-point decimals, and amounts exceeding 1,00,00,000 paise (₹1,00,000 INR).

### 2. Multi-Document ACID Transactions (Replica Set)
When connected to a replica set (MongoDB Atlas or local `mongod --replSet rs0`):
- Operates inside `session.withTransaction()`.
- Atomically executes:
  1. Conditional debit on sender: `Wallet.findOneAndUpdate({ userId: senderId, balance: { $gte: amount } }, { $inc: { balance: -amount } })`.
  2. Credit on receiver: `Wallet.findOneAndUpdate({ userId: receiverId }, { $inc: { balance: amount } })`.
  3. Ledger record insertion in `transactions`.
- If any operation fails or balance is insufficient, `session.abortTransaction()` rolls back all writes.

### 3. Standalone Fallback & Compensating Rollback
If MongoDB is running in standalone mode (without a replica set):
- The service automatically catches `IllegalOperation` / transaction unsupported errors.
- Executes an **atomic conditional debit**: `{ userId: senderId, balance: { $gte: amount } }`.
- If the sender has insufficient funds, the query matches 0 documents and fails with `400 Bad Request`. Balances **can never drop below zero**.
- If recipient credit or ledger insertion fails, an automated **compensating balance rollback** restores the debited amount to the sender.

### 4. Idempotency Key Handling
- Supports the `Idempotency-Key` HTTP header.
- Backed by a compound unique sparse index `{ idempotencyKey: 1, senderId: 1 }`.
- If a client retries a request, the duplicate key is detected either via pre-check or database `E11000` collision handling, safely returning the original transaction with `"isDuplicate": true` without executing a second debit.

### 5. Transaction Status State Machine

```
              ┌───────────────┐
              │    pending    │
              └───────┬───────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌───────────┐
   │ success │   │ failed  │   │ cancelled │
   └────┬────┘   └─────────┘   └───────────┘
        │         (Terminal)    (Terminal)
        ▼
   ┌──────────┐
   │ reversed │
   └──────────┘
    (Terminal)
```

- **Terminal States:** Transactions in `failed`, `cancelled`, or `reversed` status can never be modified.
- **Reversal from Success:** A completed transfer (`success`) can only transition to `reversed`. Arbitrary status changes to `failed` or `pending` are blocked.
- **Financial Reversal Execution:** Transitioning to `reversed` verifies that the recipient has `balance >= transaction.amount`, debits the recipient, credits the sender, and logs the action to `AuditLog`.

---

## Environment Configuration

The application is configured through environment variables. A template is provided in `.env.example`.

### Supported Variables

| Variable | Required | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | No | `3000` | Port on which the Express HTTP server listens |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `MONGO_URI` | **Yes** | `mongodb://127.0.0.1:27017/fintech_dev` | Primary development/production MongoDB connection URI |
| `MONGO_URI_TEST` | **Yes** (for tests) | `mongodb://127.0.0.1:27017/fintech_test` | Dedicated isolated database URI for integration tests |
| `JWT_SECRET` | **Yes** | None (Min 32 chars) | Secret key used to sign and verify HMAC SHA-256 JWTs |
| `JWT_EXPIRES_IN` | No | `1d` | Token expiration duration (e.g. `1d`, `12h`) |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | No | `900000` (15 min) | Time window in milliseconds for login rate limiting |
| `RATE_LIMIT_LOGIN_MAX` | No | `5` | Maximum login attempts per IP within the time window |
| `RATE_LIMIT_REGISTER_WINDOW_MS`| No | `3600000` (1 hour) | Time window in milliseconds for registration rate limiting |
| `RATE_LIMIT_REGISTER_MAX` | No | `10` | Maximum account registrations per IP within the time window |
| `SEED_ADMIN_EMAIL` | No | `admin@example.com` | Email for default administrator created by seed script |
| `SEED_ADMIN_PASSWORD` | No | `AdminSecure123!` | Password for default administrator created by seed script |
| `SEED_SUPPORT_EMAIL` | No | `support@example.com` | Email for default support account created by seed script |
| `SEED_SUPPORT_PASSWORD` | No | `SupportSecure123!` | Password for default support account created by seed script |

### Safe Local Setup Procedure

1. Copy `.env.example` to create your local `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Replace placeholders with your actual secure credentials. Ensure `JWT_SECRET` is at least 32 characters long.
3. **Never commit `.env` to Git.** The root `.gitignore` file must ignore `.env`.

---

## Installation & Local Setup

### 1. Prerequisites
- **Node.js:** v18.0.0 or higher (v22 LTS recommended).
- **npm:** v9.0.0 or higher.
- **MongoDB:** v6.0 or higher (local installation, Docker, or MongoDB Atlas).

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/fintech-assesment.git
cd fintech-assesment
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create your local `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Ensure `JWT_SECRET` is set to a secure string of at least 32 characters.

### 5. MongoDB Setup (Configuring a Replica Set)

Multi-document ACID transactions require MongoDB to run as a replica set. Choose one of the following methods:

#### Option A: Docker (Recommended - Fastest Setup)
```bash
# Run MongoDB with replica set flag enabled
docker run -d --name fintech-mongo -p 27017:27017 mongo:7.0 --replSet rs0 --bind_ip_all

# Wait 3 seconds, then initiate the replica set
docker exec -it fintech-mongo mongosh --eval "rs.initiate()"
```

#### Option B: Local MongoDB Service (Windows / Linux / macOS)
1. Open your MongoDB configuration file (`mongod.cfg` on Windows, `/etc/mongod.conf` on Linux).
2. Add the replication block:
   ```yaml
   replication:
     replSetName: "rs0"
   ```
3. Restart the MongoDB service:
   - **Windows:** `Restart-Service MongoDB` (in Administrator PowerShell)
   - **Linux:** `sudo systemctl restart mongod`
   - **macOS:** `brew services restart mongodb-community`
4. In terminal or `mongosh`, initiate the replica set:
   ```bash
   mongosh --eval "rs.initiate()"
   ```

#### Option C: MongoDB Atlas (Cloud)
Create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas). Atlas clusters are pre-configured 3-node replica sets supporting transactions natively. Paste your connection URI into `.env`.

### 6. Seed Default Admin & Support Accounts
Administrative accounts cannot be created via public registration. Run the idempotent seed script:
```bash
npm run seed
```
This creates:
- **Administrator:** `admin@example.com` / `AdminSecure123!` (or values defined in `SEED_ADMIN_*`)
- **Support Staff:** `support@example.com` / `SupportSecure123!` (or values defined in `SEED_SUPPORT_*`)

### 7. Start the Server

- **Development Mode (with auto-reload):**
  ```bash
  npm run dev
  ```
- **Standard Mode:**
  ```bash
  npm start
  ```

### 8. Verify Server Health
Check that the server is operational:
```bash
curl http://localhost:3000/health
```
*Expected response:* `{"status":"ok","uptime":...,"timestamp":"..."}`

---

## Testing

The project uses the **Node.js built-in test runner** (`node:test`) and strict assertions (`node:assert/strict`).

### Available Test Commands

| Command | Scope | Description |
| :--- | :--- | :--- |
| `npm test` | Full Test Suite | Runs all unit and integration test files matching `tests/**/*.test.js`. |
| `node --test tests/unit/**/*.test.js` | Unit Tests | Executes all 53 unit tests across 14 suites with zero database dependencies. |
| `node --test tests/integration/rateLimiter.test.js` | Rate Limiter Test | Validates IP request throttling thresholds. |
| `node --test tests/integration/*.test.js` | Integration Tests | Runs all end-to-end API integration tests (requires replica set MongoDB). |

### Test Database Isolation Safeguard

All integration tests are protected by `tests/helpers/testDbGuard.js`. When running integration tests:
1. `MONGO_URI_TEST` must be explicitly defined in `.env`.
2. `MONGO_URI_TEST` **must not match** `MONGO_URI`.
3. The database name in `MONGO_URI_TEST` **must explicitly contain the word `test`**.
4. Tests will immediately abort with a fatal error if a collision with the development database is detected.

### Verified Unit Test Coverage

Running `node --test tests/unit/**/*.test.js` verifies **53 passing tests across 14 suites**:
- **Admin Service:** Self-demotion guard, last-active-admin guard, state machine transition checks, insufficient balance reversal rejection.
- **Admin Validators:** Role change payload bounds, status change payload bounds.
- **App & Security:** `/health` endpoint, Helmet headers, CORS headers, 404 handler.
- **Auth Validators:** Email normalization, 72-byte password bounds, multibyte character handling, forbidden field rejection.
- **Authorize Middleware:** Unauthenticated rejection (`401`), unconfigured role rejection (`403`), cross-role permission checks.
- **Database Isolation Guard:** URI collision detection, host matching, database name parsing.
- **User Model:** Password hashing comparison, JSON transformation credential stripping.
- **Wallet Service:** Concurrency race duplicate key recovery (`E11000`), standalone fallback, recipient role validation.

---

## Postman API Testing

An exportable collection is included in the project root:
[`fintech_api.postman_collection.json`](./fintech_api.postman_collection.json)

### Importing the Collection

1. Open **Postman** (or the **Thunder Client** extension in VS Code).
2. Click **Import** and select `fintech_api.postman_collection.json`.
3. The collection includes pre-configured collection variables:
   - `baseUrl`: `http://localhost:3000`
   - `customerToken`: Automatically set upon customer login/registration.
   - `adminToken`: Automatically set upon admin login.
   - `supportToken`: Automatically set upon support login.
   - `sampleReceiverId`: Recipient customer ID for transfer testing.
   - `sampleTransactionId`: Transaction UUID for status update testing.

### Recommended 7-Step Verification Sequence

Follow this sequence to test all roles, permissions, and financial edge cases:

1. **Register Customer (Alice):**
   - Call `POST /api/auth/register`.
   - Verify `201 Created` response with `role: "customer"` and token issuance. Note that wallet is automatically initialized to 0 paise.
2. **Register Customer (Bob - Recipient):**
   - Call `POST /api/auth/register` with a second email. Save Bob's `user.id` as `sampleReceiverId`.
3. **Inspect Profile & Wallet Balance:**
   - Call `GET /api/auth/me` with Alice's token (`200 OK`).
   - Call `GET /api/wallet` with Alice's token (`200 OK`). Note balance is `0` paise. Notice no `userId` URL parameter (IDOR-immune).
4. **Perform Transfers (Valid and Invalid):**
   - **Self-Transfer:** Call `POST /api/wallet/transfer` with `receiverId` set to Alice's own ID. Verify `400 Bad Request` (*"Cannot transfer funds to yourself"*).
   - **Insufficient Balance:** Attempt to transfer 5000 paise when balance is 0. Verify `400 Bad Request` (*"Insufficient wallet balance"*).
   - **Idempotency Replay:** Send transfer with `Idempotency-Key: idem-test-01`. First request executes; second identical request returns `200 OK` with `"isDuplicate": true` without deducting funds twice.
5. **Inspect Transaction History:**
   - Call `GET /api/wallet/transactions`. Verify transactions include `"direction": "debit"` or `"direction": "credit"`.
6. **Test Role Boundaries (Support & Admin):**
   - Log in as Support (`support@example.com` / `SupportSecure123!`).
   - Attempt `POST /api/wallet/transfer` with Support token. Verify `403 Forbidden`.
   - Attempt `PATCH /api/admin/users/:userId/role` with Support token. Verify `403 Forbidden`.
   - Call `GET /api/admin/transactions` with Support token. Verify `200 OK` (read-only cross-user transaction access).
7. **Test Admin Operations, Role Safeguards & Status Reversals:**
   - Log in as Admin (`admin@example.com` / `AdminSecure123!`).
   - Attempt self-demotion on Admin account. Verify `400 Bad Request` (*"Administrators cannot demote their own account"*).
   - Update user role: `PATCH /api/admin/users/:userId/role` with `role: "support"` and a mandatory reason (`200 OK`).
   - Reversal test: Call `PATCH /api/admin/transactions/:transactionId/status` with `status: "reversed"`. Recipient is debited, sender is refunded, and the action is logged to `AuditLog`.
   - Inspect audit trail: `GET /api/admin/audit-logs` (`200 OK`).

---

## Assignment Deliverables

This repository contains the required deliverables for the Buddica Global Solutions technical assignment:

1. **Public GitHub Repository:** Clean git history, organized modular architecture, and isolated configurations.
2. **Project Documentation (`README.md`):** Complete, technically verified documentation covering architecture, security, database design, setup, and testing.
3. **Postman Collection (`fintech_api.postman_collection.json`):** Exportable collection with automated tests, variables, and full coverage of authentication, wallet, and administrative modules.
4. **AI Usage Summary Sheet (`AI_Usage_Summary_Sheet.md`):** Complete disclosure of AI tools utilized (documentation, test scaffolding, Postman scripts) and manual implementation ownership.

---

## License & Author

- **License:** [ISC License](https://opensource.org/licenses/ISC) (as specified in `package.json`).
- **Author:** Developed for the **Buddica Global Solutions Pvt. Ltd.** Technical Assessment (October 2026).
