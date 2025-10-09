# Koimsurai's Digital Universe - Personal Portfolio & Activity Dashboard

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

This repository contains the source code for my personal portfolio website, a full-stack application designed to showcase my projects, skills, and real-time activities from various platforms.

## 🚀 Live Demo

**(Link to your live website here)**

## ✨ Features

This project is more than just a static portfolio. It integrates a dynamic backend to create a living dashboard of my digital footprint.

*   **Frontend & UI:**
    *   **Interactive 3D Scenes:** Engaging visuals built with `Three.js` and `@react-three/fiber`, including a stunning Saturn animation.
    *   **Rich Animations:** Smooth page transitions and component animations powered by `Framer Motion`.
    *   **Modern UI:** Styled with `Tailwind CSS` for a clean and responsive design.
    *   **Blog Platform:** A complete blog with posts fetched from the backend, rendered from Markdown with `@uiw/react-md-editor`.
    *   **Project & Photo Galleries:** Masonry-style, progressively-loaded image galleries to showcase portfolio work and photography.
    *   **Virtual Bookshelf:** A section to display books I've read or am currently reading.

*   **Backend & Dynamic Data:**
    *   **Activity Dashboard:** Aggregates and displays my latest activities from:
        *   **WakaTime:** Daily coding statistics.
        *   **GitHub:** Recent commits, repository updates, and contribution graph.
        *   **Steam:** Recently played games and library information.
        *   **Spotify:** Recently played tracks and top artists/genres.
    *   **API Gateway:** The Express.js backend acts as a secure proxy to fetch data from third-party APIs, bypassing CORS issues and protecting API keys.
    *   **Database Integration:** Uses `SQLite` for blog posts, comments, and other persistent data.

## 🛠️ Tech Stack

### Frontend

*   **Framework:** React 19
*   **Build Tool:** Vite
*   **3D Graphics:** Three.js, @react-three/fiber, @react-three/drei
*   **Styling:** Tailwind CSS, PostCSS
*   **Animation:** Framer Motion, React Spring
*   **State Management:** Jotai
*   **Routing:** React Router
*   **Markdown:** @uiw/react-md-editor, React-Markdown

### Backend

*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Database:** SQLite3
*   **Authentication:** JWT (JSON Web Tokens), bcryptjs
*   **API Client:** Axios

### DevOps

*   **Containerization:** Docker, Docker Compose
*   **Web Server/Proxy:** Configuration supports proxying through Nginx (implied in `vite.config.js`).

## 📂 Project Structure

The project is a monorepo-like structure with two main parts:

```
/
├── server/         # The Node.js/Express.js backend
├── src/            # The React/Vite frontend source code
├── docker-compose.yml
└── Dockerfile      # For the frontend service
```

## ⚙️ Getting Started (Local Development)

The recommended way to run this project is using Docker, but you can also run the frontend and backend services separately.

### Prerequisites

*   Git
*   Node.js (v18 or newer recommended)
*   Docker and Docker Compose (for containerized setup)

### 1. Clone the Repository

```bash
git clone https://github.com/timo9378/web.git
cd web-1
```

### 2. Backend Setup

The backend requires several API keys and secrets to function correctly.

1.  Navigate to the server directory:
    ```bash
    cd server
    ```

2.  Create an environment file by copying the example:
    ```bash
    cp .env.example .env
    ```

3.  **Edit `.env`** and fill in **all** the required values. This is a crucial step.

    ```env
    # --- REQUIRED ---

    # Admin account for managing blog posts etc.
    ADMIN_USERNAME=your_admin_username
    ADMIN_PASSWORD=your_secure_password

    # A long, random string for signing JWT tokens
    JWT_SECRET=your_jwt_secret_key_here

    # WakaTime API Key (from your WakaTime settings)
    WAKATIME_API_KEY=your_wakatime_api_key

    # Steam API Key & ID
    # Get Key: https://steamcommunity.com/dev/apikey
    # Find ID: https://steamid.io/
    STEAM_API_KEY=your_steam_api_key
    STEAM_ID=your_64_bit_steam_id

    # Spotify API Credentials
    # Create an app on the Spotify Developer Dashboard to get these
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token # (Get this after initial OAuth flow)

    # --- OPTIONAL ---
    PORT=3001
    NODE_ENV=development
    ```

4.  Install dependencies:
    ```bash
    npm install
    ```

5.  Start the backend server:
    ```bash
    npm run dev
    ```
    The backend will be running on `http://localhost:3001`.

### 3. Frontend Setup

1.  Navigate back to the project root directory:
    ```bash
    cd ..
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the frontend development server:
    ```bash
    npm run dev
    ```
    The frontend will be available at `http://localhost:5173` (or another port if 5173 is busy). It is pre-configured to proxy API requests to the backend.

## 🐳 Docker Deployment (Recommended)

The simplest way to get the entire application running.

1.  **Ensure `server/.env` is created and complete** as described in the "Backend Setup" section above. The Docker setup depends on this file.

2.  Build and start the services in detached mode from the project root:
    ```bash
    docker-compose up -d --build
    ```

3.  The application will be accessible at `http://localhost:13588`.

4.  To stop the services:
    ```bash
    docker-compose down
    ```

5.  To view logs:
    ```bash
    docker-compose logs -f frontend
    docker-compose logs -f backend
    ```

## 📜 Available Scripts

*   `npm run dev`: Starts the Vite frontend development server.
*   `npm run build`: Builds the frontend for production.
*   `npm run lint`: Lints the codebase.
*   `npm run preview`: Serves the production build locally.
*   `npm run build:photos`: A custom script to process photos.

In the `server` directory:
*   `npm run start`: Starts the backend server.
*   `npm run dev`: Starts the backend server with `node --watch` for auto-reloading.