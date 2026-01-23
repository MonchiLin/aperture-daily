# Architecture Documentation

## 🏗 Tech Stack Strategy

### Frontend (User Interface)
- **Framework**: **Astro** (Static Site Generation + Server Side Rendering). Chosen for performance and content-focused approach.
- **Interactivity**: **React** (via Astro Islands). Used for dynamic components where user interaction is required (e.g., admin dashboard, complex article views).
- **Styling**: **TailwindCSS (v4)** for utility-first styling, complemented by **Ant Design** (Admin UI) and **Radix UI** (Accessible primitives).
- **State Management**: **Nanostores**. Lightweight, framework-agnostic state management suitable for Astro's multi-island architecture.
- **Motion**: **Framer Motion**. For smooth, premium-feeling animations.

### Backend (API & Processing)
- **Runtime**: **Bun**. Chosen for high performance and built-in tooling (test runner, package manager).
- **Framework**: **ElysiaJS**. High-performance web framework optimized for Bun.
- **Database Layer**: **Kysely**. Type-safe SQL query builder.
- **AI Integration**: **OpenAI SDK**. For interacting with LLMs (Gemini, OpenAI, Claude).
- **Task Queue**: Custom implementation using database-backed queues for robustness (handling long-running AI tasks).

---

## 🗺 Directory Map

### Root
- `/server`: Backend API and worker processes.
- `/src`: Frontend source code.
- `/public`: Static assets.

### Backend (`/server`)
- `index.ts`: **Entry Point**. Initializes the Elysia server and starts background workers (Task Queue, Cron).
- `routes/`: **API Controllers**. Defines HTTP endpoints and handles request/response logic.
- `src/services/`: **Business Logic**. Contains core domain logic (e.g., `tasks`, `articles`, `profiles`).
- `db/`: **Data Layer**. Database migrations, schema definitions, and connection logic.

### Frontend (`/src`)
- `pages/`: **Astro Routes**. File-based routing for the application.
- `components/`: **UI Components**.
  - `admin/`: Admin dashboard components.
  - `react/`: General React components.
- `layouts/`: **Page Wrappers**. Shared layouts (e.g., `Layout.astro`).
- `stores/`: **State**. Nanostores definitions for client-side state.

---

## 🔄 Data Flow

1.  **Ingestion**:
    -   Cron jobs trigger RSS fetching or manual tasks are submitted.
    -   `TaskQueue` picks up jobs.

2.  **Processing**:
    -   **Backend** fetches content (Article text).
    -   **AI Services** (LLMs) process content (Summarization, Translation, Analysis).
    -   Results are stored in the **Database**.

3.  **Presentation**:
    -   **Astro** fetches data from the API during build or SSR.
    -   Data is rendered into HTML.
    -   **React Islands** hydrate for interactive features (e.g., "Impression Mode" toggles, Admin actions), fetching additional data from API if needed.
