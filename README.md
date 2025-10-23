# API Key Manager - Production Server

A professional, production-ready API key management system with real-time monitoring, usage tracking, and advanced analytics.

## 🚀 Features

### Core Features
- **API Key Management**: Create, update, delete, and manage API keys with custom configurations
- **Real-time Monitoring**: WebSocket-based live updates for keys and system logs
- **Usage Tracking**: Monitor API key usage, requests, and rate limits
- **Advanced Analytics**: Detailed statistics and metrics for all API keys
- **Audit Logging**: Complete audit trail with filterable system logs
- **Rate Limiting**: Built-in rate limiting per API key (RPM and thread limits)
- **Expiration Management**: Automatic handling of expired keys with cleanup utilities

### Security Features
- **JWT Authentication**: Secure token-based authentication system
- **Rate Limiting**: Protection against brute-force attacks (5 attempts per 15 minutes)
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, etc.
- **CORS Protection**: Configurable CORS with origin whitelisting
- **Input Validation**: Comprehensive validation on all endpoints
- **Secure WebSocket**: Origin validation for WebSocket connections

### Performance Features
- **In-Memory Caching**: Fast API key lookups with cache hit rate tracking
- **Database Connection Pooling**: Efficient MongoDB connection management
- **Gzip Compression**: Automatic response compression
- **Circuit Breaker**: Automatic failure handling with recovery
- **Request Retry Logic**: Exponential backoff for failed requests
- **Response Caching**: Client-side caching with TTL and ETag support

### Frontend Features
- **Modern React UI**: Built with React 18, TypeScript, and Tailwind CSS
- **Dark Mode**: Full dark mode support
- **Real-time Updates**: Live WebSocket connection for instant updates
- **Responsive Design**: Mobile-first responsive design
- **PWA Support**: Progressive Web App with offline capabilities
- **Error Boundaries**: Graceful error handling throughout the app
- **Advanced Filtering**: Multi-criteria filtering with saved presets
- **Data Export**: Export logs and keys to JSON

## 🛠 Tech Stack

### Backend
- **Language**: Go 1.x
- **Framework**: Gin Web Framework
- **Database**: MongoDB with connection pooling
- **Authentication**: JWT (golang-jwt/jwt)
- **WebSocket**: Gorilla WebSocket
- **Validation**: go-playground/validator

### Frontend
- **Framework**: React 18.2.0 with TypeScript 4.9.5
- **Build Tool**: Vite 6.3.5
- **Styling**: Tailwind CSS 3.3.0
- **State Management**: Zustand 4.4.0
- **HTTP Client**: Axios 1.6.0 with interceptors
- **Animation**: Framer Motion 10.16.0
- **Icons**: Lucide React
- **Routing**: React Router DOM 6.8.0
- **Notifications**: React Hot Toast

## 📦 Installation

### Prerequisites
- Go 1.19 or higher
- Node.js 18+ and npm/yarn
- MongoDB 4.4 or higher

### Backend Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd prod-server
```

2. Configure the server by creating/editing `server.json`:
```json
{
  "serverPort": "3001",
  "mongoURI": "mongodb+srv://your-connection-string",
  "databaseName": "apiKeysManager",
  "apiKeysCollection": "apiKeys",
  "logsCollection": "logs",
  "readTimeout": 30,
  "writeTimeout": 30,
  "idleTimeout": 60,
  "jwtSecret": "your-super-secret-jwt-key-change-this-in-production",
  "adminPassword": "your-secure-password",
  "maxRetries": 3,
  "retryDelay": 1000,
  "logDir": "logs",
  "maxLogSize": 10485760,
  "maxLogFiles": 5
}
```

3. Install Go dependencies:
```bash
go mod download
```

4. Build and run the server:
```bash
go run prod-server.go
```

Or build a production binary:
```bash
go build -o prod-server prod-server.go
./prod-server
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. For development:
```bash
npm run dev
```

4. For production build:
```bash
npm run build
```

The production build will be embedded in the Go binary and served automatically.

## 🔧 Configuration

### Environment Variables
The application uses `server.json` for configuration. Key settings:

- **serverPort**: Port for the HTTP server (default: 3001)
- **mongoURI**: MongoDB connection string
- **jwtSecret**: Secret key for JWT token signing (MUST be changed in production)
- **adminPassword**: Admin login password (MUST be changed in production)
- **logDir**: Directory for file-based logs
- **maxLogSize**: Maximum size for log files before rotation (bytes)
- **maxLogFiles**: Number of log files to retain

### Security Considerations

⚠️ **IMPORTANT**: Before deploying to production:
1. Change the default `jwtSecret` to a strong random string
2. Change the default `adminPassword` to a secure password
3. Update CORS settings in the code to whitelist only trusted origins
4. Enable HTTPS/TLS for production deployment
5. Configure MongoDB with authentication enabled
6. Set up proper firewall rules

## 📚 API Documentation

### Authentication

#### Login
```http
POST /server/api/v1/auth/login
Content-Type: application/json

{
  "password": "your-password"
}
```

Response:
```json
{
  "token": "jwt-token",
  "expiresAt": 1234567890
}
```

### API Key Management

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

#### Create API Key
```http
POST /server/api/v1/keys
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "My API Key",
  "customKey": "optional-custom-key",
  "rpm": 1000,
  "threadsLimit": 10,
  "totalRequests": 100000,
  "expiration": "30d"
}
```

Expiration formats: `m` (minutes), `h` (hours), `d` (days), `w` (weeks), `mo` (months), `y` (years)

#### List API Keys
```http
GET /server/api/v1/keys?page=1&limit=50&filter=active&search=keyword
Authorization: Bearer <token>
```

#### Get Single API Key
```http
GET /server/api/v1/keys/{id}
Authorization: Bearer <token>
```

#### Update API Key
```http
PUT /server/api/v1/keys/{id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Name",
  "rpm": 2000,
  "isActive": true
}
```

#### Delete API Key
```http
DELETE /server/api/v1/keys/{id}
Authorization: Bearer <token>
```

#### Clean Expired Keys
```http
POST /server/api/v1/keys/clean
Authorization: Bearer <token>
```

### Logs

#### Get Logs
```http
GET /server/api/v1/logs?page=1&limit=100&level=ERROR&component=apikey&search=keyword
Authorization: Bearer <token>
```

### Health Check

```http
GET /server/api/v1/health
```

Response includes:
- Uptime
- Total/Active/Expired keys
- Memory usage
- MongoDB status
- Cache hit rate
- Go routines count

### WebSocket

Connect to real-time updates:
```
ws://localhost:3001/server/api/v1/ws?token=<jwt-token>
```

Event types:
- `key_created`: New API key created
- `key_updated`: API key updated
- `key_deleted`: API key deleted
- `log_entry`: New log entry

## 🎯 Usage Examples

### Creating an API Key with cURL
```bash
# Login
TOKEN=$(curl -X POST http://localhost:3001/server/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' | jq -r '.token')

# Create key
curl -X POST http://localhost:3001/server/api/v1/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Production API Key",
    "rpm": 5000,
    "threadsLimit": 20,
    "totalRequests": 1000000,
    "expiration": "90d"
  }'
```

### Frontend Usage

1. Access the application at `http://localhost:3001`
2. Login with your admin password
3. Navigate through the dashboard to:
   - View real-time statistics
   - Create new API keys
   - Manage existing keys
   - Monitor system logs
   - Export data

## 📊 Monitoring & Logging

### File Logging
- Logs are stored in the `logs/` directory
- Files are automatically rotated when they exceed `maxLogSize`
- Old log files are automatically cleaned up based on `maxLogFiles`
- Format: `app_YYYY-MM-DD.log`

### Database Logging
- All system events are logged to MongoDB
- Filterable by level (INFO, WARN, ERROR, DEBUG)
- Filterable by component
- Full-text search support
- Audit trail for all key operations

### Metrics
- Cache hit rate
- Total API keys (active/expired)
- Memory usage
- MongoDB connection status
- WebSocket client count
- Request latency

## 🔒 Security Best Practices

1. **Strong Passwords**: Use strong, unique passwords for admin access
2. **JWT Secrets**: Use cryptographically secure random strings (64+ characters)
3. **HTTPS**: Always use HTTPS in production
4. **Rate Limiting**: Default is 5 login attempts per 15 minutes
5. **Security Headers**: Automatically applied (CSP, HSTS, X-Frame-Options, etc.)
6. **Input Validation**: All inputs are validated server-side
7. **CORS**: Configure to whitelist only trusted origins
8. **MongoDB**: Enable authentication and use encrypted connections

## 🚀 Deployment

### Docker Deployment (Recommended)

Create a `Dockerfile`:
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o prod-server prod-server.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/prod-server .
COPY server.json .
EXPOSE 3001
CMD ["./prod-server"]
```

Build and run:
```bash
docker build -t api-key-manager .
docker run -p 3001:3001 -v $(pwd)/server.json:/root/server.json api-key-manager
```

### Binary Deployment

```bash
# Build
go build -ldflags="-s -w" -o prod-server prod-server.go

# Run
./prod-server
```

### Systemd Service

Create `/etc/systemd/system/api-key-manager.service`:
```ini
[Unit]
Description=API Key Manager
After=network.target

[Service]
Type=simple
User=apimanager
WorkingDirectory=/opt/api-key-manager
ExecStart=/opt/api-key-manager/prod-server
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable api-key-manager
sudo systemctl start api-key-manager
```

## 🐛 Troubleshooting

### WebSocket Connection Issues
- Ensure CORS settings allow your origin
- Check that JWT token is valid and not expired
- Verify firewall allows WebSocket connections

### MongoDB Connection Errors
- Verify MongoDB URI is correct
- Check MongoDB is running and accessible
- Ensure database user has proper permissions

### High Memory Usage
- Reduce cache size by limiting the number of keys
- Lower the log retention (`maxLogFiles`)
- Monitor the cache hit rate

### Performance Issues
- Enable gzip compression (now included by default)
- Increase MongoDB connection pool size
- Enable caching on the frontend
- Use pagination for large datasets

## 📝 License

This project is proprietary software. All rights reserved.

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For support, please:
- Check the documentation
- Review troubleshooting section
- Open an issue on GitHub

## 🔄 Changelog

### Version 2.1 (2025-10-23)
- ✅ Fixed WebSocket ping timeout errors
- ✅ Added rate limiting for login attempts (5/15min)
- ✅ Improved CORS security with origin whitelisting
- ✅ Added comprehensive security headers (CSP, HSTS, X-Frame-Options, etc.)
- ✅ Added gzip compression middleware
- ✅ Fixed static file cache-control headers
- ✅ Enhanced SEO with meta tags, Open Graph, Twitter cards
- ✅ Added PWA support with manifest.json
- ✅ Added robots.txt and sitemap.xml
- ✅ Improved Logs page error handling and duplicate prevention
- ✅ Better error messages (less verbose, no information leakage)
- ✅ Improved WebSocket handling with proper channel management

### Version 2.0
- Initial production release
- Full API key management
- Real-time WebSocket updates
- MongoDB integration
- React frontend with TypeScript
- JWT authentication
- Comprehensive logging

---

**Made with ❤️ for API Key Management**
