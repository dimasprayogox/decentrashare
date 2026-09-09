# 🌐 DecentraShare

<div align="center">

![DecentraShare Banner](https://raw.githubusercontent.com/dimasprayogox/decentrashare/main/frontend/static/favicon.png)

### Decentralized, Verifiable & Encrypted File Storage System

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma_ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Solidity](https://img.shields.io/badge/Solidity_0.8.20-363636?style=for-the-badge&logo=solidity&logoColor=white)](https://soliditylang.org/)
[![IPFS](https://img.shields.io/badge/IPFS_Pinata-65C2CB?style=for-the-badge&logo=ipfs&logoColor=white)](https://ipfs.tech/)
[![Docker](https://img.shields.io/badge/Docker_Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  <b>DecentraShare</b> is a Web3-powered cloud storage platform combining decentralized IPFS persistence, EVM smart contract proof-of-ownership, and a full-stack document management suite with fine-grained access control.
</p>

</div>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Smart Contract Specification](#-smart-contract-specification)
- [Database Schema (Prisma)](#-database-schema-prisma)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Local Development Setup](#local-development-setup)
  - [Docker Compose Deployment](#docker-compose-deployment)
- [API Overview](#-api-overview)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Security Features](#-security-features)
- [Author & License](#-author--license)

---

## 🚀 Overview

Traditional cloud storage platforms rely on centralized trust, making data vulnerable to single points of failure, unauthorized tampering, and vendor lock-in. 

**DecentraShare** bridges traditional user experience with decentralized infrastructure:
1. **Decentralized Storage**: Files are stored and pinned across the InterPlanetary File System (IPFS).
2. **On-Chain Proof-of-Existence**: Content hashes (SHA-256) and IPFS CIDs are registered immutably on Ethereum/EVM-compatible blockchains.
3. **Cryptographic Identity**: Passwordless authentication via Ethereum wallet signature verification (EIP-4361 standard).
4. **Enterprise-Grade File Management**: Nested folders, sharing permissions, soft deletion/trash lifecycles, and in-browser file previews.

---

## ✨ Key Features

### 🔐 Web3 Cryptographic Authentication
- **Passwordless Sign-In**: Authenticate using EVM wallets (MetaMask, Coinbase Wallet, WalletConnect).
- **Nonce-Based Verification**: Cryptographically signed challenge nonces prevent replay attacks.
- **Session Security**: Dual-token architecture using HTTP-Only Refresh Cookies and short-lived JWT Access Tokens.

### 🌐 Decentralized Storage & Deduplication
- **IPFS Integration**: Direct file upload and pinning powered by the Pinata Web3 SDK.
- **SHA-256 Deduplication**: Content-hash calculation before upload prevents redundant network storage and duplicate on-chain registration.

### ⛓️ Smart Contract Proof-of-Ownership
- **Immutable Timestamping**: Stores IPFS CID, file content hash, owner address, and block timestamp on-chain.
- **Batch Registration**: Gas-optimized batch uploads supporting up to 10 files in a single transaction.
- **Independent Verification**: Anyone can verify file authenticity and original ownership directly on-chain without backend reliance.

### 📁 Advanced File & Folder Management
- **Hierarchical Directories**: Full recursive folder trees with parent-child relationship handling.
- **Granular Access Roles**: Configurable permissions (`PRIVATE`, `PUBLIC`, `LINK_ONLY`, `SPECIFIC_USER`) with role levels (`VIEWER`, `EDITOR`).
- **File Previews**: In-browser rendering for PDF, DOCX (Mammoth), XLSX (SheetJS), HEIC/HEIF images, and standard media.
- **Trash & Archive**: Multi-stage deletion lifecycle with instant restore capabilities.

### 📊 Audit & Activity Logs
- Comprehensive activity tracking recording entity changes, actions (upload, rename, move, delete, share), and corresponding blockchain transaction hashes.

### 🎨 Modern, Accessible Interface
- Built with **Svelte 5 runes** and **SvelteKit 2** for ultra-fast reactive rendering.
- Styled with **Tailwind CSS v4** featuring responsive layouts and dynamic Light/Dark mode themes.

---

## 🏗️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client (SvelteKit 2)                          │
│        Svelte 5 Runes • Tailwind CSS v4 • Ethers.js • Framer Motion    │
└───────────────────▲────────────────────────────────┬───────────────────┘
                    │ REST API / JWT                 │ Sign Message / TX
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Backend API Gateway (Bun)      │  │        EVM Blockchain        │
│   Express 5 • Winston • Helmet • Zod │  │   DecentraShare.sol (0.8.20) │
└──────┬───────────────────────┬───────┘  └──────────────▲───────────────┘
       │                       │                         │
       ▼                       ▼                         │ On-chain Record
┌──────────────┐       ┌───────────────┐                 │
│  PostgreSQL  │       │  IPFS Gateway │─────────────────┘
│ (Prisma ORM) │       │ (Pinata SDK)  │
└──────────────┘       └───────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | SvelteKit 2, Svelte 5, TypeScript | Reactive SPA/SSR client |
| **Styling** | Tailwind CSS v4, Framer Motion | Modern UI & seamless animations |
| **Runtime & Server** | Bun, Express.js 5, TypeScript | High-performance backend service |
| **Database & ORM** | PostgreSQL 15, Prisma ORM | Relational metadata, hierarchy & logs |
| **Blockchain** | Solidity 0.8.20, Hardhat, Ethers.js | Proof-of-ownership smart contract |
| **Decentralized Storage**| IPFS, Pinata Web3 SDK | Distributed file hosting & pinning |
| **Containerization** | Docker, Docker Compose | Reproducible development & production builds |

---

## 📜 Smart Contract Specification

The smart contract `DecentraShare.sol` handles immutable records of ownership on EVM chains.

```solidity
struct FileRecord {
    string ipfsHash;    // IPFS CID
    string fileName;    // Original file name
    string fileHash;    // SHA-256 hash of file content
    address owner;      // Uploader wallet address
    uint256 timestamp;  // Block timestamp
}
```

### Core Methods

- `recordFile(string _ipfsHash, string _fileName, string _fileHash)`: Registers a single file record.
- `recordFilesBatch(string[] _ipfsHashes, string[] _fileNames, string[] _fileHashes)`: Batch registers up to 10 files in one transaction to minimize gas fees.
- `verifyOwner(string _ipfsHash) external view returns (address)`: Returns the verified owner of a given CID.
- `checkFileExists(string _fileHash) external view returns (bool)`: Verifies if a content hash has already been registered.

---

## 🗄️ Database Schema (Prisma)

The relational schema stores user sessions, document metadata, folder trees, and audit trails:

- **`User`**: Wallet address, unique username, email, role (`USER`/`ADMIN`), storage quota, nonces for Web3 auth.
- **`Folder`**: Recursive hierarchical tree structure (`parentId`), privacy level, share tokens, and archive status.
- **`Document`**: File metadata (size, MIME type, IPFS CID, SHA-256 hash, blockchain transaction hash, on-chain status, folder link).
- **`DocumentAccess` / `FolderAccess`**: Fine-grained access control mappings per user (`VIEWER`, `EDITOR`).
- **`ActivityLog`**: System-wide immutable action log with associated entity IDs and blockchain transaction references.

---

## 📂 Project Structure

```
decentrashare/
├── backend/
│   ├── contracts/            # Solidity smart contracts (DecentraShare.sol)
│   ├── ignition/             # Hardhat deployment modules
│   ├── prisma/               # Database schema & migration files
│   ├── src/
│   │   ├── abis/             # Generated Smart Contract ABIs
│   │   ├── config/           # Database, Pinata, & app configurations
│   │   ├── middlewares/      # Auth, CORS, rate limiting, error handlers
│   │   ├── modules/          # Domain modules (auth, document, folder, user, logs)
│   │   ├── utils/            # Hashing, crypto, & blockchain helper utilities
│   │   ├── app.ts            # Express application configuration
│   │   └── server.ts         # Server bootstrapper
│   ├── test/                 # Unit & integration test suites
│   ├── Dockerfile            # Production Docker configuration
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── lib/              # Shared components, stores, & utilities
│   │   ├── routes/
│   │   │   ├── (auth)/       # Web3 authentication route handlers
│   │   │   ├── (dashboard)/  # Main file manager, folders, trash, & settings
│   │   │   └── share/        # Public token-shared views
│   │   ├── app.css           # Global stylesheet & Tailwind directives
│   │   └── app.html
│   ├── static/               # Assets, icons, and favicons
│   └── package.json
│
├── docker-compose.yml        # Multi-container orchestration (API + PostgreSQL)
└── README.md
```

---

## 🛠️ Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (>= 1.1) or [Node.js](https://nodejs.org/) (>= 20)
- [Docker](https://www.docker.com/) & Docker Compose
- [MetaMask](https://metamask.io/) or any EVM Web3 wallet
- [Pinata Account](https://www.pinata.cloud/) (for IPFS API Key & Gateway)

---

### Environment Configuration

#### 1. Backend (`backend/.env`)
```env
PORT=3000
NODE_ENV=development

# PostgreSQL Database URL
DATABASE_URL="postgresql://murkoboy:password@localhost:5432/decentrashare_db?schema=public"

# JWT Secrets
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Pinata IPFS Credentials
PINATA_API_KEY="your_pinata_api_key"
PINATA_SECRET_KEY="your_pinata_secret_key"
PINATA_JWT="your_pinata_jwt"
PINATA_GATEWAY="https://gateway.pinata.cloud"

# Blockchain RPC & Contract
BLOCKCHAIN_RPC_URL="http://127.0.0.1:8545"
CONTRACT_ADDRESS="0xYourDeployedContractAddress"
PRIVATE_KEY="0xYourDeployerPrivateKey"
```

#### 2. Frontend (`frontend/.env`)
```env
PUBLIC_BACKEND_URL="http://localhost:3000"
PUBLIC_IPFS_GATEWAY="https://gateway.pinata.cloud/ipfs"
PUBLIC_CONTRACT_ADDRESS="0xYourDeployedContractAddress"
```

---

### Local Development Setup

#### 1. Start Database
```bash
docker run --name decentrashare-postgres \
  -e POSTGRES_DB=decentrashare_db \
  -e POSTGRES_USER=murkoboy \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15-alpine
```

#### 2. Setup & Run Backend
```bash
cd backend
bun install

# Run database migrations
bun run db:migrate
bun run db:generate

# Start Hardhat local node & deploy contracts (optional for local testing)
npx hardhat node
npx hardhat ignition deploy ignition/modules/DecentraShare.ts --network localhost

# Start backend dev server
bun run dev
```

#### 3. Setup & Run Frontend
```bash
cd ../frontend
bun install
bun run dev
```

Visit `http://localhost:5173` to access the application.

---

### 🐳 Docker Compose Deployment

Run the complete backend stack with a single command:

```bash
docker-compose up -d
```

---

## 📡 API Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/auth/nonce` | Generate unique sign-in nonce for wallet address | ❌ |
| `POST` | `/api/auth/verify` | Verify cryptographic signature and issue JWT | ❌ |
| `POST` | `/api/auth/refresh` | Refresh access token using HTTP-only cookie | ❌ |
| `POST` | `/api/auth/logout` | Revoke session and clear cookies | ✅ |
| `GET` | `/api/documents` | List user documents (with filters & search) | ✅ |
| `POST` | `/api/documents/upload` | Upload file to IPFS, compute hash & record | ✅ |
| `GET` | `/api/documents/:id` | Get document details & metadata | ✅ |
| `DELETE` | `/api/documents/:id` | Soft delete document (move to trash) | ✅ |
| `GET` | `/api/folders` | Retrieve user folder hierarchy | ✅ |
| `POST` | `/api/folders` | Create a new directory | ✅ |
| `POST` | `/api/folders/:id/share`| Generate shareable token for folder | ✅ |
| `GET` | `/api/activity-logs` | Fetch system audit logs | ✅ |

---

## 🧪 Testing & Quality Assurance

The codebase includes automated unit, integration, and smart contract test suites.

```bash
# Run backend test suite
cd backend
bun test

# Run smart contract tests with Hardhat
npx hardhat test

# Run test coverage analysis
bun run test:coverage
```

---

## 🛡️ Security Features

- **Decentralized Integrity**: Every file is verifiable via SHA-256 hash matching on IPFS and smart contracts.
- **EIP-4361 Web3 Signature Auth**: Nonces with expiration limits eliminate brute force and credential stuffing vectors.
- **Hardened HTTP Headers**: Helmet enabled for security headers, strict CORS origin isolation, and rate-limiting middleware to mitigate DoS attempts.
- **Type-Safe Validation**: Strict runtime schema parsing using **Zod** across all request payloads.
- **Zero Raw File Storage on Server**: Uploads stream directly to IPFS without persistent unencrypted storage on server disks.

---

## 👨‍💻 Author & Contact

**Dimas Prayogo**  
- GitHub: [@dimasprayogox](https://github.com/dimasprayogox)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
