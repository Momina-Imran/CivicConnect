# CivicConnect

CivicConnect is a web platform that connects citizens' complaints with the NGOs and departments relevant to their sector. Citizens register, submit complaints (with an optional image attachment) and track their status. NGOs register under a sector, view the complaints addressed to them, and update status and remarks.

**Stack:** Node.js, Express, MySQL 8 (`mysql2`), JWT authentication, `multer` for uploads. Express serves the frontend (`public/`) and the API (`/api/*`) from a single port.

This repository is also used for **CSC418 – DevOps for Cloud Computing, Assignment 2**: containerized deployment on AWS EC2 (Part I) and a Jenkins CI/CD pipeline (Part II)

---

## Project structure

```
CivicConnect/
├── public/                      # frontend (HTML, CSS, JS)
├── uploads/                     # complaint attachments (git-ignored except .gitkeep)
├── server.js                    # Express API + static server
├── schema.sql                   # reference schema (tables are auto-created at startup)
├── package.json
├── Dockerfile                   # Part I: builds the web image
├── .dockerignore
├── docker-compose.yml           # Part I: web (Docker Hub image) + MySQL
├── docker-compose.jenkins.yml   # Part II: web (code volume) + MySQL
├── Jenkinsfile                  # Part II: pipeline script
└── .env.example
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the app listens on |
| `JWT_SECRET` | dev value | Secret for signing tokens (change it!) |
| `DB_HOST` | `localhost` | MySQL host (`db` inside docker-compose) |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | empty | MySQL password |
| `DB_NAME` | `civicconnect` | Database name |

The server creates the tables on first start and retries the DB connection up to 10 times, so it tolerates MySQL starting slowly.

## Run locally (without Docker)

```bash
cp .env.example .env     # edit DB credentials
npm install
npm start                # http://localhost:3000
```

Health check: `GET /api/health` → `{"status":"OK","database":"connected", ...}`

---

## Part I – Docker on AWS EC2

| Service | Host port | Container port | Notes |
|---|---|---|---|
| Web (`civic_web`) | **8000** | 3000 | image `YOURHUB/civicconnect:1.0` |
| MySQL (`civic_db`) | **3307** | 3306 | persistent volume `civic_db_data` |

```bash
# build and push the image
docker build -t YOURHUB/civicconnect:1.0 .
docker login -u YOURHUB
docker push YOURHUB/civicconnect:1.0

# launch the application
docker compose up -d
docker compose ps
```

Open `http://<EC2_IP>:8000` and `http://<EC2_IP>:8000/api/health`.

Verify the database:

```bash
docker exec -it civic_db mysql -ucivic_app -p'CivicPass#2026' civicconnect \
  -e "SHOW TABLES; SELECT id,name,email FROM users;"
```

Data persists across restarts (`docker compose down` without `-v`).

## Part II – Jenkins pipeline

| Service | Host port | Container port | Notes |
|---|---|---|---|
| Web (`ci_civic_web`) | **8001** | 3000 | `node:20-alpine`, code mounted as a volume |
| MySQL (`ci_civic_db`) | **3308** | 3306 | volume `ci_civic_db_data` |
| Jenkins | **8080** | 8080 | runs on the same EC2 instance |

Pipeline stages (see `Jenkinsfile`):

1. **Checkout from GitHub** – Git plugin clones the repository.
2. **Pull images** – Docker Pipeline plugin pulls `node:20-alpine` and `mysql:8.0`.
3. **Build & Deploy** – `docker compose -p ci -f docker-compose.jenkins.yml up -d --force-recreate`.
4. **Verify** – polls `http://localhost:8001/api/health` until the app is up.
5. **Post** – emails the build result to the developer who pushed (`emailext`).

A GitHub webhook (`http://<EC2_IP>:8080/github-webhook/`, event: push) triggers the pipeline on every push to `main`.

## Notes

- Replace `YOURHUB`, `YOURGITHUB` and `YOUR_ELASTIC_IP` in the compose file and Jenkinsfile with your own values.
- Change `JWT_SECRET` and the database passwords before using this outside a coursework setting.
- Never commit `.env`; it is already listed in `.gitignore`.