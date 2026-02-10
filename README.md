# ONIVA Backend

An on-demand personal driver service backend built with Node.js, Express, and PostgreSQL. ONIVA connects clients with professional drivers for convenient transportation.

## 🎯 Features

- **User Management** - Support for clients, drivers, and admins with role-based access control
- **Trip Management** - Book point-to-point and hourly rides with real-time tracking
- **Real-time Communication** - WebSocket support via Socket.io for live updates
- **Authentication** - Secure JWT-based authentication with bcrypt password hashing
- **Location Services** - Geolocation and distance calculation features
- **Dynamic Pricing** - Flexible pricing calculation based on distance, time, and demand
- **Dispatch System** - Intelligent driver dispatch and management
- **Admin Dashboard** - Administrative features for platform management
- **Database Logging** - Comprehensive logging for debugging and monitoring

## 📋 Requirements

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn
- Docker & Docker Compose (optional, for containerized setup)

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd oniva-be
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=oniva_db

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

# API
API_URL=http://localhost:5000
```

### 4. Database Setup

#### Option A: Using Docker Compose

```bash
docker-compose up -d
```

This will:
- Start a PostgreSQL 15 container
- Create the database with initial schema
- Start pgAdmin for database management

#### Option B: Manual PostgreSQL Setup

```sql
createdb oniva_db
psql -d oniva_db -f database/schema.sql
```

Or run the creation script:

```bash
npm run createTable
```

## 🚀 Development

### Start development server with auto-reload

```bash
npm run dev
```

The server will start on `http://localhost:5000` and automatically restart on file changes using Nodemon.

### Start production server

```bash
npm start
```

## 📁 Project Structure

```
src/
├── app.js                    # Express app configuration
├── server.js                 # Server startup and initialization
├── config/
│   └── database.js          # Database connection and configuration
├── middleware/
│   ├── auth.js              # JWT authentication middleware
│   └── errorHandler.js      # Global error handling middleware
├── models/
│   ├── User.js              # User data operations
│   ├── Driver.js            # Driver data operations
│   └── Trip.js              # Trip/booking data operations
├── routes/
│   ├── auth.routes.js       # Authentication endpoints
│   ├── admin.routes.js      # Admin management endpoints
│   ├── client.routes.js     # Client endpoints
│   ├── driver.routes.js     # Driver endpoints
│   ├── trip.routes.js       # Trip management endpoints
│   └── location.routes.js   # Location services endpoints
├── services/
│   ├── auth.service.js      # Authentication business logic
│   ├── dispatch.service.js  # Driver dispatch logic
│   ├── pricing.service.js   # Dynamic pricing calculations
│   └── socket.service.js    # Real-time WebSocket handling
└── utils/
    └── logger.js            # Logging utility
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token

### Clients
- `GET /api/clients/profile` - Get client profile
- `PUT /api/clients/profile` - Update client profile
- `GET /api/clients/trips` - Get client's trips
- `POST /api/clients/trips` - Book a new trip

### Drivers
- `GET /api/drivers/profile` - Get driver profile
- `PUT /api/drivers/profile` - Update driver profile
- `GET /api/drivers/trips` - Get driver's assigned trips
- `PUT /api/drivers/trips/:tripId/status` - Update trip status
- `POST /api/drivers/location` - Update driver location

### Trips
- `GET /api/trips/:tripId` - Get trip details
- `PUT /api/trips/:tripId` - Update trip
- `POST /api/trips/:tripId/cancel` - Cancel trip
- `GET /api/trips/:tripId/estimate` - Get price estimate

### Locations
- `GET /api/locations/search` - Search locations
- `POST /api/locations/distance` - Calculate distance

### Admin
- `GET /api/admin/users` - List users
- `GET /api/admin/drivers` - List drivers
- `GET /api/admin/analytics` - Platform analytics
- `DELETE /api/admin/users/:userId` - Delete user

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in request headers:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:5000/api/clients/profile
```

## 🗄️ Database Schema

The database includes tables for:
- **users** - User accounts with roles (client, driver, admin)
- **drivers** - Driver-specific information and status
- **trips** - Trip records with pricing and route information
- **locations** - Location and address data
- **ride_history** - Historical trip data for analytics

Run `npm run createTable` to initialize the database with the schema.

## 🔄 Real-time Features

Socket.io is configured for real-time updates:

**Client Events:**
- `trip:created` - New trip created
- `driver:found` - Driver assigned to trip
- `trip:started` - Trip has started
- `driver:location:updated` - Driver location update
- `trip:completed` - Trip completed

**Driver Events:**
- `trip:assigned` - New trip assignment
- `client:location:updated` - Client location update
- `trip:cancelled` - Trip cancellation

## 📊 Logging

All activities are logged to the console and log files. Check the `logs/` directory for detailed logs.

## 🐳 Docker Deployment

### Build Docker image

```bash
docker build -t oniva-backend .
```

### Run with Docker Compose

```bash
docker-compose up --build
```

### Access Services

- **API**: http://localhost:5000
- **pgAdmin** (Database UI): http://localhost:5050
  - Email: admin@admin.com
  - Password: admin

## 📦 Dependencies

- **express** ^5.2.1 - Web framework
- **pg** ^8.18.0 - PostgreSQL client
- **socket.io** ^4.8.3 - Real-time communication
- **jsonwebtoken** ^9.0.3 - JWT authentication
- **bcrypt** ^6.0.0 - Password hashing
- **cors** ^2.8.6 - Cross-origin resource sharing
- **helmet** ^8.1.0 - Security headers
- **morgan** ^1.10.1 - HTTP request logging
- **dotenv** ^17.2.3 - Environment variables
- **validator** ^13.15.26 - Data validation
- **uuid** ^13.0.0 - Unique ID generation

## 🛠️ Development Tools

- **nodemon** ^3.1.11 - Auto-restart on file changes

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment (development/production) | development |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_USER` | PostgreSQL username | postgres |
| `DB_PASSWORD` | PostgreSQL password | postgres |
| `DB_NAME` | Database name | oniva_db |
| `JWT_SECRET` | JWT signing secret | (required for production) |
| `JWT_EXPIRY` | JWT token expiration | 24h |

## 🚨 Error Handling

The application includes comprehensive error handling with:
- Global error middleware for catching unhandled errors
- Consistent error response format
- Detailed logging for debugging
- Validation error messages

## 📝 Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with Nodemon |
| `npm run createTable` | Initialize database schema |

## 🔒 Security Features

- **JWT Authentication** - Token-based user authentication
- **Password Hashing** - Bcrypt for secure password storage
- **Helmet.js** - Secure HTTP headers
- **CORS** - Cross-origin request control
- **Input Validation** - Using validator library
- **SQL Prevention** - Parameterized queries for SQL injection prevention

## 📞 Support & Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -d oniva_db
```

### Port Already in Use

Change the `PORT` in `.env` or kill the process:

```bash
lsof -i :5000
kill -9 <PID>
```

### Module Not Found

```bash
rm -rf node_modules package-lock.json
npm install
```

## 📄 License

ISC

## 👥 Contributing

Contributions are welcome! Please follow the existing code structure and add tests for new features.

---

**Last Updated:** February 2026
