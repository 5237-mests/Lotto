

```markdown
# Telegram Mini App Lottery Platform (Scheduled Draws & Instant Spinner)

> **Specification & Implementation Blueprint for AI Code Generation & Developer Onboarding**  
> **Target Environment:** Google AI Studio / Gemini Code Assist  
> **Architecture:** Server-Authoritative Microservice + React Telegram Mini App  

---

## 1. System Architecture & High-Level Overview

The system consists of a server-authoritative backend, a Telegram Mini App frontend (HTML5/React), and integration with Telegram WebApp SDK and TON Blockchain / Telegram Stars for payments.


```

+-----------------------------------------------------------------------+
|                         TELEGRAM MINI APP                             |
|  +-----------------------------------+  +--------------------------+  |
|  |   Scheduled Lottery Module        |  |  Instant Spinner Module  |  |
|  +-----------------------------------+  +--------------------------+  |
|  |                Telegram WebApp SDK (Haptics, InitData)           |  |
+-----------------------------------++----------------------------------+
||
HTTPS / WSS (HMAC WebApp InitData)
||
+-----------------------------------vv----------------------------------+
|                            BACKEND API                                |
|  +-----------------------+ +------------------+ +------------------+  |
|  | Auth & HMAC Validator | | Payment Gateway  | | RNG Engine       |  |
|  +-----------------------+ +------------------+ +------------------+  |
|  | Scheduled Draw Worker | | State Engine     | | Hashing Verification|
|  +-----------------------+ +------------------+ +------------------+  |
+-----------------------------------++----------------------------------+
||
+-----------------------++-----------------------+
|                                                |
+-----------v------------+                      +------------v-----------+
| PostgreSQL / Redis DB  |                      |  TON / Stars Gateway   |
+------------------------+                      +------------------------+

```

---

## 2. Security & Game Integrity Protocols

### 2.1 Server-Authoritative Integrity
* **Anti-Cheat Enforcement:** No draw outcome or probability logic shall exist in client-side code. The client acts strictly as an input device and rendering target.
* **Authentication:** Every API request must pass the raw `window.Telegram.WebApp.initData` in the `Authorization` header. The backend must validate the signature using `HMAC-SHA256` against the Telegram Bot Token before executing state-changing logic.

### 2.2 Provably Fair Random Number Generation (RNG)
Instant draws and scheduled lotteries utilize a **Provably Fair HMAC-SHA256 System**:

$$\text{Outcome Seed} = \text{HMAC-SHA256}(\text{Server Seed}, \text{Client Seed} + \text{Nonce})$$

1. **Server Seed:** Generated securely on the backend (`crypto.randomBytes(32)`). The SHA-256 hash of the server seed is revealed to the user *before* the spin/purchase.
2. **Client Seed:** Provided by the user or derived from their Telegram User ID and transaction timestamp.
3. **Nonce:** Auto-incrementing integer representing the user's total spin count.
4. **Outcome Extraction:** The resulting HMAC hash is converted to an integer and mapped to weighted prize pools or lottery ticket number allocations via modulo arithmetic over cumulative weight matrices.

---

## 3. Database Schema (PostgreSQL)

```sql
-- Users Table
CREATE TABLE users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(64),
    first_name VARCHAR(64),
    balance_coins NUMERIC(18, 4) DEFAULT 0.0000,
    balance_stars INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Scheduled Lottery Draws
CREATE TABLE lottery_draws (
    draw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    ticket_price NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(10) CHECK (currency IN ('TON', 'STARS', 'COINS')),
    payout_pool NUMERIC(18, 4) DEFAULT 0.0000,
    status VARCHAR(20) CHECK (status IN ('OPEN', 'LOCKED', 'COMPLETED', 'CANCELLED')) DEFAULT 'OPEN',
    draw_time TIMESTAMP WITH TIME ZONE NOT NULL,
    winning_numbers INT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User Purchased Tickets
CREATE TABLE lottery_tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID REFERENCES lottery_draws(draw_id) ON DELETE CASCADE,
    telegram_id BIGINT REFERENCES users(telegram_id),
    selected_numbers INT[] NOT NULL,
    purchase_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Instant Spinner Configuration
CREATE TABLE spinner_sectors (
    sector_id INT PRIMARY KEY,
    label VARCHAR(50) NOT NULL,
    prize_type VARCHAR(20) CHECK (prize_type IN ('COINS', 'STARS', 'FREE_TICKET', 'NO_WIN')),
    prize_value NUMERIC(18, 4) DEFAULT 0,
    weight INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Instant Spinner Audit Logs
CREATE TABLE spinner_logs (
    spin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT REFERENCES users(telegram_id),
    sector_id INT REFERENCES spinner_sectors(sector_id),
    server_seed VARCHAR(64) NOT NULL,
    client_seed VARCHAR(64) NOT NULL,
    nonce INT NOT NULL,
    spin_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

```

---

## 4. API Specification & Data Contracts

### 4.1 Authenticate & Fetch Profile

* **Endpoint:** `POST /api/v1/auth/telegram`
* **Headers:** `Authorization: Bearer <Telegram.WebApp.initData>`
* **Response:**

```json
{
  "success": true,
  "data": {
    "telegram_id": 123456789,
    "username": "player_one",
    "balances": {
      "coins": 150.00,
      "stars": 20
    }
  }
}

```

### 4.2 Instant Spinner Trigger

* **Endpoint:** `POST /api/v1/spinner/spin`
* **Payload:**

```json
{
  "client_seed": "user_custom_seed_9982"
}

```

* **Response:**

```json
{
  "success": true,
  "data": {
    "winning_index": 3,
    "sector": {
      "id": 3,
      "label": "50 Coins",
      "prize_type": "COINS",
      "prize_value": 50.00
    },
    "animation": {
      "duration_ms": 4000,
      "total_rotations": 8
    },
    "provably_fair": {
      "server_seed_hash": "a1b2c3...",
      "nonce": 14
    }
  }
}

```

---

## 5. Reference Implementation

### 5.1 Backend: HMAC Auth & Spinner Engine (`server.js`)

```javascript
const crypto = require('crypto');
const express = require('express');
const router = express.Router();

function verifyTelegramWebAppData(telegramInitData, botToken) {
  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}

function selectWeightedSector(sectors, hashHex) {
  const totalWeight = sectors.reduce((acc, s) => acc + s.weight, 0);
  const numericValue = parseInt(hashHex.substring(0, 8), 16);
  let randomWeight = numericValue % totalWeight;

  for (const sector of sectors) {
    if (randomWeight < sector.weight) {
      return sector;
    }
    randomWeight -= sector.weight;
  }
  return sectors[0];
}

router.post('/spin', async (req, res) => {
  const initData = req.headers['authorization']?.replace('Bearer ', '');
  if (!initData || !verifyTelegramWebAppData(initData, process.env.BOT_TOKEN)) {
    return res.status(401).json({ success: false, error: 'Unauthorized payload signature' });
  }

  const { client_seed } = req.body;
  const userNonce = 14; 
  const serverSeed = crypto.randomBytes(32).toString('hex');

  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${client_seed}:${userNonce}`);
  const outcomeHash = hmac.digest('hex');

  const sectors = [
    { id: 0, label: 'Try Again', weight: 400, prize_type: 'NO_WIN', prize_value: 0 },
    { id: 1, label: '10 Coins', weight: 300, prize_type: 'COINS', prize_value: 10 },
    { id: 2, label: '1 Free Ticket', weight: 200, prize_type: 'FREE_TICKET', prize_value: 1 },
    { id: 3, label: '50 Coins', weight: 90, prize_type: 'COINS', prize_value: 50 },
    { id: 4, label: 'JACKPOT', weight: 10, prize_type: 'COINS', prize_value: 500 }
  ];

  const winningSector = selectWeightedSector(sectors, outcomeHash);

  res.json({
    success: true,
    data: {
      winning_index: winningSector.id,
      sector: winningSector,
      animation: { duration_ms: 4000, total_rotations: 8 },
      provably_fair: {
        server_seed_hash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
        nonce: userNonce
      }
    }
  });
});

module.exports = router;

```

### 5.2 Frontend: HTML5 Canvas Wheel Component (`SpinnerWheel.jsx`)

```jsx
import React, { useRef, useState } from 'react';

const SECTORS = [
  { label: 'Try Again', color: '#1E293B' },
  { label: '10 Coins', color: '#0EA5E9' },
  { label: '1 Free Ticket', color: '#10B981' },
  { label: '50 Coins', color: '#F59E0B' },
  { label: 'JACKPOT', color: '#EF4444' }
];

export function SpinnerWheel({ initData }) {
  const canvasRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const drawWheel = (rotationAngle = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const total = SECTORS.length;
    const arc = (2 * Math.PI) / total;
    const radius = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(rotationAngle);

    SECTORS.forEach((sector, i) => {
      const angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = sector.color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius - 10, angle, angle + arc);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(sector.label, radius - 25, 5);
      ctx.restore();
    });

    ctx.restore();
  };

  const executeSpin = async () => {
    if (isSpinning) return;
    setIsSpinning(true);

    try {
      const response = await fetch('/api/v1/spinner/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${initData}`
        },
        body: JSON.stringify({ client_seed: 'user_seed_123' })
      });
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      const targetIndex = result.data.winning_index;
      const totalSectors = SECTORS.length;
      const sectorArc = (2 * Math.PI) / totalSectors;
      
      const targetAngle = (totalSectors - targetIndex) * sectorArc - (sectorArc / 2);
      const totalRotation = (8 * Math.PI * 2) + targetAngle;

      const duration = result.data.animation.duration_ms;
      const start = performance.now();

      const animate = (time) => {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const currentRotation = totalRotation * easeOut(progress);

        drawWheel(currentRotation);

        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsSpinning(false);
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          }
          alert(`You won: ${result.data.sector.label}`);
        }
      };

      requestAnimationFrame(animate);
    } catch (err) {
      console.error(err);
      setIsSpinning(false);
    }
  };

  React.useEffect(() => {
    drawWheel();
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-white" />
        <canvas ref={canvasRef} width={300} height={300} className="rounded-full shadow-lg" />
      </div>
      <button
        onClick={executeSpin}
        disabled={isSpinning}
        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50"
      >
        {isSpinning ? 'Spinning...' : 'Spin Now'}
      </button>
    </div>
  );
}

```

---

## 6. Execution Roadmap

1. **Environment Setup:** Configure bot credentials via `@BotFather`, expose local server with `ngrok`, and setup PostgreSQL database tables.
2. **Backend Authentication:** Wire `verifyTelegramWebAppData` middleware to secure express routes using the bot HTTP API token.
3. **Frontend Integration:** Integrate `@twa-dev/sdk`, connect the `SpinnerWheel` component to the backend `/spin` endpoint, and attach Telegram haptic feedback hooks.
4. **Scheduled Worker Setup:** Configure background jobs using Redis and BullMQ to handle automatic draw payouts at designated intervals.

```

```
