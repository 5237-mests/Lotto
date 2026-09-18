# Admin Dashboard Specification: Telegram Lottery & Spinner Platform

> **System Management, Financial Operations, and Compliance Specification**  
> **Target Audience:** Backend/Frontend Developers & AI Studio Implementation  
> **Platform Stack:** React / Next.js Admin Panel + Node.js Admin API Gateway + MySQL  

---

## 1. High-Level Admin Architecture & Security

The Admin Dashboard is a standalone web interface built for platform operators. It interfaces with the lottery backend through a secured `/api/v1/admin/*` API gateway.

```
+-----------------------------------------------------------------------+
|                          ADMIN DASHBOARD                              |
|  +-----------------------+ +--------------------+ +----------------+  |
|  | Lottery Operations    | | Spinner Management | | User Ledger    |  |
|  +-----------------------+ +--------------------+ +----------------+  |
|  | Financial Analytics   | | Anti-Fraud Audit   | | RBAC & Logs    |  |
|  +-----------------------+ +--------------------+ +----------------+  |
+-----------------------------------++----------------------------------+
                                    ||
                 HTTPS / REST + WebSockets (JWT + MFA)
                                    ||
+-----------------------------------vv----------------------------------+
|                          ADMIN API GATEWAY                            |
|  +-----------------------+ +--------------------+ +----------------+  |
|  | RBAC & Auth Guard     | | Draw Orchestrator  | | Financial Engine| |
|  +-----------------------+ +--------------------+ +----------------+  |
+-----------------------------------++----------------------------------+
                                    ||
                          +---------vv---------+
                          | MySQL Database|
                          +--------------------+
```

### 1.1 Security & Access Control
* **Authentication:** Multi-Factor Authentication (MFA) via Time-based One-Time Passwords (TOTP/Google Authenticator).
* **Role-Based Access Control (RBAC):**
  * **Super Admin:** Full access (System settings, manually triggering draws, adjusting balances, adding admins).
  * **Lottery Manager:** Creates, schedules, and manages draws and spinner sector configurations.
  * **Finance Officer:** Approves withdrawals, views audit logs, and monitors payout pools.
  * **Support Specialist:** View-only access to user profiles, ticket histories, and spin logs for resolving user tickets.
* **Audit Logging:** Every administrative action (e.g., updating sector weights, adjusting balances) is recorded in an immutable `admin_audit_logs` database table.

---

## 2. Core Functional Modules

### 2.1 Scheduled Lottery Draw Management
Allows managers to create and monitor automated daily, weekly, or special event draws.

* **Create New Draw:**
  * Define Draw Title, Ticket Price (TON, Stars, Coins), Max Tickets Per User, Draw Start & End Timestamps.
  * Set Multi-Tier Prize Rules (e.g., Match 6/6 = 70% Pool, Match 5/6 = 20% Pool, Match 4/6 = 10% Pool).
* **Draw Lifecycle Controls:**
  * **OPEN:** Tickets can be purchased.
  * **LOCKED:** Sales closed; draw engine calculating/verifying HMAC seeds.
  * **FORCE DRAW:** Manual override button (Super Admin only) to execute winning number selection immediately.
  * **CANCEL / REFUND:** Aborts an active draw and automatically credits ticket funds back to users' platform balances.

### 2.2 Instant Spinner Management Engine
Real-time control over the wheel of fortune mechanics, weights, and profitability metrics.

* **Sector Weight Editor:**
  * Interface to modify labels, icons, prize types (`COINS`, `STARS`, `FREE_TICKET`, `NO_WIN`), and values.
  * Real-Time Probability Calculator: Automatically computes and displays the theoretical Win % per sector based on integer weight ratios:
    $$\text{Win } \% = \left( \frac{\text{Sector Weight}}{\sum \text{All Weights}} \right) \times 100$$
* **RTP (Return To Player) Simulator:**
  * Runs a 1,000,000-spin Monte Carlo simulation before publishing weight changes to prevent balance drain or unviable payouts.

### 2.3 User Management & Ledger Controls
Provides support teams with complete visibility into player activities and wallet states.

* **User Search & Profile Inspection:**
  * Query by Telegram ID, Username, or Wallet Address.
  * View current balances (Coins, Stars, TON), total spent, total won, and calculated Net Profit/Loss.
* **Manual Balance Adjustments:**
  * Super Admin capability to deposit/deduct coins with mandatory internal memo logs (e.g., "Promotional reward", "Chargeback adjustment").
* **Account Status Controls:**
  * Ban/Unban user accounts to prevent malicious bots or exploited requests from hitting backend endpoints.

### 2.4 Anti-Fraud & Provably Fair Verification Module
* **Seed Audit Tool:** Paste a `Spin ID` or `Draw ID` to inspect the `Server Seed`, `Client Seed`, and `Nonce`. The dashboard executes the HMAC verification function in the browser to confirm non-tampered outcomes.
* **Automated Anomaly Detection Alerts:**
  * Triggers flag alerts when a user exceeds a configurable win velocity threshold (e.g., $>5$ jackpot spins within 10 minutes).

---

## 3. Database Schema Extensions for Admin Controls

```sql
-- Admin Users Table
CREATE TABLE admin_users (
    admin_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('SUPER_ADMIN', 'LOTTERY_MANAGER', 'FINANCE_OFFICER', 'SUPPORT')) NOT NULL,
    mfa_secret VARCHAR(64),
    is_mfa_enabled BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin Audit Log Table
CREATE TABLE admin_audit_logs (
    log_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    admin_id CHAR(36) REFERENCES admin_users(admin_id),
    action VARCHAR(100) NOT NULL, -- e.g., "UPDATE_SPINNER_WEIGHTS", "MANUAL_BALANCE_CREDIT"
    target_resource VARCHAR(50) NOT NULL, -- e.g., "users:123456789"
    payload JSON,
    ip_address VARCHAR(45),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Withdrawal Requests / Financial Approval Queue
CREATE TABLE withdrawal_requests (
    request_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    telegram_id BIGINT REFERENCES users(telegram_id),
    amount DECIMAL(18, 4) NOT NULL,
    currency VARCHAR(10) CHECK (currency IN ('TON', 'STARS')),
    destination_wallet VARCHAR(128) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED')) DEFAULT 'PENDING',
    processed_by CHAR(36) REFERENCES admin_users(admin_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
);
```

---

## 4. Admin API Endpoint Specifications

### 4.1 Update Spinner Sector Configuration
* **Endpoint:** `PUT /api/v1/admin/spinner/sectors`
* **Headers:** `Authorization: Bearer <Admin_JWT>`
* **Payload:**
```json
{
  "sectors": [
    { "sector_id": 0, "label": "Try Again", "weight": 400, "prize_type": "NO_WIN", "prize_value": 0 },
    { "sector_id": 1, "label": "10 Coins", "weight": 300, "prize_type": "COINS", "prize_value": 10 },
    { "sector_id": 2, "label": "1 Free Ticket", "weight": 200, "prize_type": "FREE_TICKET", "prize_value": 1 },
    { "sector_id": 3, "label": "50 Coins", "weight": 90, "prize_type": "COINS", "prize_value": 50 },
    { "sector_id": 4, "label": "JACKPOT", "weight": 10, "prize_type": "COINS", "prize_value": 500 }
  ]
}
```
* **Response:**
```json
{
  "success": true,
  "message": "Spinner configuration updated and cached in Redis successfully.",
  "calculated_rtp": "84.5%"
}
```

### 4.2 Force-Trigger Scheduled Draw Execution
* **Endpoint:** `POST /api/v1/admin/draws/:draw_id/execute`
* **Headers:** `Authorization: Bearer <Admin_JWT>`
* **Response:**
```json
{
  "success": true,
  "data": {
    "draw_id": "b2c3d4e5-...",
    "status": "COMPLETED",
    "winning_numbers": [7, 14, 21, 33, 42],
    "total_payout": 1250.00,
    "winning_tickets_count": 12
  }
}
```

---

## 5. Summary Dashboard Metrics (KPIs)

The Admin Overview screen features real-time charts providing instant situational awareness:

1. **GGR (Gross Gaming Revenue):** $\text{Total Ticket \& Spin Revenue} - \text{Total Payouts Paid}$.
2. **DAU / MAU:** Daily Active Users vs. Monthly Active Users inside the Telegram Mini App.
3. **Spinner House Margin:** Real-time variance tracking comparing expected RTP vs. actual win distribution over time.
4. **Active Draw Pool:** Cumulative value across all currently open scheduled lotteries.

---

## 6. Implementation Status & Operator Runbook

All specifications defined in this document have been implemented across the backend server, database schemas, and frontend Telegram Mini App UI.

### 6.1 Codebase Implementation Map

| Specification Component | Implementation Path | Description |
| :--- | :--- | :--- |
| **Admin UI Component** | `/src/components/AdminDashboard.tsx` | Full single-page management console with 6 tabs, RBAC role switcher, and live charts. |
| **API Gateway Router** | `/server/adminService.ts` | Express router handling `/api/v1/admin/*`, RBAC authentication, and Monte Carlo engine. |
| **Server Mounting** | `/server.ts` | Integrated at `/api/v1/admin` with CORS headers (`x-admin-role`, `Authorization`). |
| **MySQL Schema** | `/server/migrations.ts` | Tables: `admin_users`, `admin_audit_logs`, `withdrawal_requests`, plus `users.is_banned`. |
| **Migration Scripts** | `package.json` (`npm run migrate`, `npm run migration`) | Executes schema migrations and seeds default admin accounts via mysql2. |
| **Shared Type Contracts** | `/src/types.ts` | TypeScript definitions for `AdminRole`, `AdminUser`, `AdminAuditLog`, `WithdrawalRequest`, etc. |

### 6.2 Pre-Seeded Admin Test Accounts

The platform includes four pre-configured administrative profiles matching each RBAC privilege tier:

| Role | Username | Password | Default Permissions |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | `superadmin` | `admin123` | Full access: All lottery lifecycle actions, force draw, refund, balance adjustment, banning, sector weights, withdrawal processing. |
| **LOTTERY_MANAGER** | `manager` | `manager123` | Create draws, toggle OPEN/LOCKED, execute draws, edit wheel sector weights, run RTP simulations. |
| **FINANCE_OFFICER** | `finance` | `finance123` | Approve, reject, or process withdrawal requests; manual balance adjustments with audit memos; financial KPI oversight. |
| **SUPPORT** | `support` | `support123` | Inspect user accounts, audit tickets and spins, toggle user account ban/unban status. |

### 6.3 Operator Workflows

#### A. Accessing the Admin Dashboard in TMA
1. Open the Telegram Mini App header navigation bar.
2. Click the **Admin** shield button with the indicator dot.
3. The Admin Console will launch with the active RBAC role selector displayed in the top header.
4. Select between **SUPER_ADMIN**, **LOTTERY_MANAGER**, **FINANCE_OFFICER**, and **SUPPORT** to test permission gates dynamically.

#### B. Executing Database Migrations
Run either of the following commands in the terminal:
```bash
npm run migrate
# or
npm run migration
```
The script will safely create all required administrative tables, foreign key constraints, indexes, and seed admin user records.

#### C. Running the Monte Carlo RTP Simulation
1. Navigate to the **Spinner** tab in the Admin Dashboard.
2. Adjust any sector weight or prize value.
3. Click **Simulate 1M Spins** to run a Monte Carlo simulation.
4. The dashboard calculates empirical RTP, hit frequency per sector, and verifies that house edge remains positive before publishing.

#### D. Auditing Provably Fair Seeds
1. Navigate to the **Audit & Fraud** tab.
2. Select **Spinner** or **Lottery Draw**.
3. Input the Server Seed, Client Seed, and Nonce.
4. Click **Verify HMAC Integrity** to recalculate the cryptographic SHA256/HMAC digest in real time.
