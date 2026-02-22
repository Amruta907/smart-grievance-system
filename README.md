
# smart-grievance-system
=======
# Smart Urban Grievance & Service Response System

A full-stack web application for citizens to report civic issues and for government authorities to manage and resolve grievances. Built with HTML, CSS, JavaScript, Node.js, Express, and SQL (SQLite).

## Features

### Citizen Portal
- **Register & Login** – Create account or sign in
- **Submit Grievances** – Report issues with category, title, description, location, and priority
- **Track Status** – View all submitted grievances and their current status
- **Grievance Details** – See updates, add comments, rate resolution, reopen if needed
- **Categories** – Potholes, Street Lights, Waste Management, Water Supply, Drainage, Parks, Traffic, Noise, etc.

### Government Authority Portal
- **Login** – Secure access for authorized personnel
- **Dashboard** – Overview of total, submitted, in-progress, and resolved grievances
- **Filter & Search** – Filter by status and department
- **Manage Grievances** – Update status, assign department, set priority, add resolution notes
- **Comments** – Add internal or public comments on grievances

### Technical
- **Responsive Design** – Works on desktop, tablet, and mobile
- **RESTful APIs** – Clean API structure for all operations
- **SQL Database** – SQLite with proper schema (users, grievances, categories, comments)
- **Session-based Auth** – Token-based authentication

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite (better-sqlite3) with SQL
- **Auth:** bcryptjs for password hashing, UUID for session tokens

## Setup

### Prerequisites
- Node.js 16+ and npm

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Initialize database** (runs automatically on first start)
   ```bash
   npm run init-db
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open in browser**
   - Home: http://localhost:3000
   - Citizen Login: http://localhost:3000/citizen-login
   - Authority Login: http://localhost:3000/authority-login

### Default Authority Credentials
- **Email:** admin@government.gov
- **Password:** admin123

## Project Structure

```
smart griverance/
├── server.js           # Express server & REST API routes
├── db.js               # Database connection
├── package.json
├── scripts/
│   └── init-db.js      # Database schema & seed data
├── data/
│   └── grievance.db    # SQLite database (created on first run)
└── public/
    ├── index.html      # Landing page
    ├── citizen-login.html
    ├── authority-login.html
    ├── citizen-dashboard.html
    ├── submit-grievance.html
    ├── grievance-detail.html
    ├── authority-dashboard.html
    ├── css/
    │   └── styles.css  # Responsive styles
    └── js/
        └── auth.js     # Auth helpers
```

## API Endpoints

### Auth
- `POST /api/auth/citizen/login` – Citizen login
- `POST /api/auth/citizen/register` – Citizen registration
- `POST /api/auth/authority/login` – Authority login
- `POST /api/auth/logout` – Logout

### Grievances (Citizen)
- `GET /api/categories` – List grievance categories
- `POST /api/grievances` – Submit grievance
- `GET /api/grievances/my` – My grievances
- `GET /api/grievances/:id` – Grievance details
- `POST /api/grievances/:id/feedback` – Rate resolution
- `POST /api/grievances/:id/reopen` – Reopen resolved grievance
- `POST /api/grievances/:id/comments` – Add comment

### Authority
- `GET /api/authority/dashboard` – Dashboard stats
- `GET /api/authority/grievances` – All grievances (with filters)
- `PATCH /api/authority/grievances/:id` – Update grievance

## Grievance Status Flow

Submitted → Assigned → In Progress → Resolved  
(Can be Rejected or Reopened at appropriate stages)

## License

MIT

