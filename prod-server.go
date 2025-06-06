package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

//go:embed frontend/dist/*
var staticFiles embed.FS

type Config struct {
	ServerPort        string `json:"serverPort"`
	MongoURI          string `json:"mongoURI"`
	DatabaseName      string `json:"databaseName"`
	ApiKeysCollection string `json:"apiKeysCollection"`
	LogsCollection    string `json:"logsCollection"`
	ReadTimeout       int    `json:"readTimeout"`
	WriteTimeout      int    `json:"writeTimeout"`
	IdleTimeout       int    `json:"idleTimeout"`
	JWTSecret         string `json:"jwtSecret"`
	AdminPassword     string `json:"adminPassword"`
	MaxRetries        int    `json:"maxRetries"`
	RetryDelay        int    `json:"retryDelay"`
}

type APIKey struct {
	ID            string    `bson:"_id" json:"id"`
	Name          string    `bson:"name,omitempty" json:"name,omitempty"`
	Expiration    time.Time `bson:"expiration" json:"expiration"`
	RPM           int       `bson:"rpm" json:"rpm"`
	ThreadsLimit  int       `bson:"threadsLimit" json:"threadsLimit"`
	TotalRequests int64     `bson:"totalRequests" json:"totalRequests"`
	UsageCount    int64     `bson:"usageCount" json:"usageCount"`
	CreatedAt     time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time `bson:"updatedAt" json:"updatedAt"`
	IsActive      bool      `bson:"isActive" json:"isActive"`
}

type APIKeyResponse struct {
	ID            string    `json:"id"`
	MaskedKey     string    `json:"maskedKey"`
	Name          string    `json:"name,omitempty"`
	Expiration    time.Time `json:"expiration"`
	RPM           int       `json:"rpm"`
	ThreadsLimit  int       `json:"threadsLimit"`
	TotalRequests int64     `json:"totalRequests"`
	UsageCount    int64     `json:"usageCount"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	IsActive      bool      `json:"isActive"`
}

type LogEntry struct {
	ID        string    `bson:"_id,omitempty" json:"id,omitempty"`
	Level     string    `bson:"level" json:"level"`
	Message   string    `bson:"message" json:"message"`
	Component string    `bson:"component" json:"component"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
	Metadata  bson.M    `bson:"metadata,omitempty" json:"metadata,omitempty"`
}

type SystemStats struct {
	TotalKeys     int64   `json:"totalKeys"`
	ActiveKeys    int64   `json:"activeKeys"`
	ExpiredKeys   int64   `json:"expiredKeys"`
	TotalRequests int64   `json:"totalRequests"`
	Uptime        int64   `json:"uptime"`
	MemoryUsage   int64   `json:"memoryUsage"`
	GoRoutines    int     `json:"goRoutines"`
	MongoStatus   bool    `json:"mongoStatus"`
	CacheHitRate  float64 `json:"cacheHitRate"`
}

type CreateKeyRequest struct {
	CustomKey     string `json:"customKey"`
	Name          string `json:"name"`
	RPM           int    `json:"rpm"`
	ThreadsLimit  int    `json:"threadsLimit"`
	TotalRequests int64  `json:"totalRequests"`
	Expiration    string `json:"expiration"`
}

type UpdateKeyRequest struct {
	Name          *string `json:"name,omitempty"`
	RPM           *int    `json:"rpm,omitempty"`
	ThreadsLimit  *int    `json:"threadsLimit,omitempty"`
	TotalRequests *int64  `json:"totalRequests,omitempty"`
	Expiration    *string `json:"expiration,omitempty"`
	IsActive      *bool   `json:"isActive,omitempty"`
}

type LoginRequest struct {
	Password string `json:"password"`
}

type TokenResponse struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expiresAt"`
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type PaginationInfo struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

type ApiResponse struct {
	Data       interface{}     `json:"data"`
	Message    string          `json:"message,omitempty"`
	Pagination *PaginationInfo `json:"pagination,omitempty"`
}

type Cache struct {
	keyToAPIKey sync.Map
	hits        int64
	misses      int64
}

func (c *Cache) GetAPIKey(key string) (*APIKey, bool) {
	value, exists := c.keyToAPIKey.Load(key)
	if !exists {
		atomic.AddInt64(&c.misses, 1)
		return nil, false
	}
	atomic.AddInt64(&c.hits, 1)
	if apiKey, ok := value.(*APIKey); ok {
		return apiKey, true
	}
	return nil, false
}

func (c *Cache) SetAPIKey(apiKey *APIKey) {
	c.keyToAPIKey.Store(apiKey.ID, apiKey)
}

func (c *Cache) DeleteAPIKey(key string) {
	c.keyToAPIKey.Delete(key)
}

func (c *Cache) GetHitRate() float64 {
	hits := atomic.LoadInt64(&c.hits)
	misses := atomic.LoadInt64(&c.misses)
	total := hits + misses
	if total == 0 {
		return 0
	}
	return float64(hits) / float64(total)
}

func (c *Cache) ListKeys() []APIKey {
	var keys []APIKey
	c.keyToAPIKey.Range(func(key, value interface{}) bool {
		if apiKey, ok := value.(*APIKey); ok {
			keys = append(keys, *apiKey)
		}
		return true
	})
	return keys
}

type APIKeyManager struct {
	mongoClient       *mongo.Client
	apiKeysCollection *mongo.Collection
	logsCollection    *mongo.Collection
	cache             *Cache
	config            *Config
	configMutex       sync.RWMutex
	startTime         time.Time
	upgrader          websocket.Upgrader
	wsClients         sync.Map
	eventChan         chan WSMessage
	shutdownOnce      sync.Once
	ctx               context.Context
	cancel            context.CancelFunc
	mongoConnected    bool
	mongoMutex        sync.RWMutex
}

func NewAPIKeyManager(config *Config) *APIKeyManager {
	ctx, cancel := context.WithCancel(context.Background())
	return &APIKeyManager{
		cache:     &Cache{},
		config:    config,
		startTime: time.Now(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		eventChan: make(chan WSMessage, 100),
		ctx:       ctx,
		cancel:    cancel,
	}
}

func loadConfig(filePath string) (*Config, error) {
	config := &Config{
		ServerPort:        "3001",
		MongoURI:          "mongodb://localhost:27017",
		DatabaseName:      "apikeys",
		ApiKeysCollection: "keys",
		LogsCollection:    "logs",
		ReadTimeout:       10,
		WriteTimeout:      10,
		IdleTimeout:       60,
		JWTSecret:         "your-secret-key-change-this",
		AdminPassword:     "admin123",
		MaxRetries:        3,
		RetryDelay:        1000,
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		log.Printf("Config file not found, using defaults")
		return config, nil
	}

	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("Error opening config file, using defaults: %v", err)
		return config, nil
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(config); err != nil {
		log.Printf("Error parsing config file, using defaults: %v", err)
		return config, nil
	}

	return config, nil
}

func (m *APIKeyManager) connectMongo() error {
	log.Printf("Attempting to connect to MongoDB at: %s", m.config.MongoURI)

	clientOptions := options.Client().
		ApplyURI(m.config.MongoURI).
		SetMaxPoolSize(10).
		SetMinPoolSize(1).
		SetRetryWrites(true).
		SetRetryReads(true).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(10 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var err error
	m.mongoClient, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		m.setMongoStatus(false)
		return fmt.Errorf("failed to connect to MongoDB: %v", err)
	}

	ctxPing, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelPing()

	if err = m.mongoClient.Ping(ctxPing, readpref.Primary()); err != nil {
		m.setMongoStatus(false)
		return fmt.Errorf("failed to ping MongoDB: %v", err)
	}

	m.apiKeysCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.ApiKeysCollection)
	m.logsCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.LogsCollection)

	m.setMongoStatus(true)
	log.Printf("Successfully connected to MongoDB")
	return nil
}

func (m *APIKeyManager) setMongoStatus(connected bool) {
	m.mongoMutex.Lock()
	defer m.mongoMutex.Unlock()
	m.mongoConnected = connected
}

func (m *APIKeyManager) isMongoConnected() bool {
	m.mongoMutex.RLock()
	defer m.mongoMutex.RUnlock()
	return m.mongoConnected
}

func (m *APIKeyManager) ensureMongoConnection() error {
	if !m.isMongoConnected() {
		return m.connectMongo()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := m.mongoClient.Ping(ctx, readpref.Primary()); err != nil {
		m.setMongoStatus(false)
		return m.connectMongo()
	}

	return nil
}

func (m *APIKeyManager) loadAPIKeysToCache() error {
	if err := m.ensureMongoConnection(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
	defer cancel()

	cursor, err := m.apiKeysCollection.Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	count := 0
	for cursor.Next(ctx) {
		var key APIKey
		if err := cursor.Decode(&key); err != nil {
			continue
		}
		m.cache.SetAPIKey(&key)
		count++
	}

	log.Printf("Loaded %d API keys to cache", count)
	return cursor.Err()
}

func generateRandomKey(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b), nil
}

func parseExpiration(expirationStr string) (time.Duration, error) {
	var numericPart, unit string
	for i, char := range expirationStr {
		if char < '0' || char > '9' {
			numericPart = expirationStr[:i]
			unit = expirationStr[i:]
			break
		}
	}
	if numericPart == "" || unit == "" {
		return 0, errors.New("invalid expiration format")
	}
	value, err := strconv.Atoi(numericPart)
	if err != nil {
		return 0, errors.New("invalid numeric value in expiration")
	}
	switch unit {
	case "m":
		return time.Duration(value) * time.Minute, nil
	case "h":
		return time.Duration(value) * time.Hour, nil
	case "d":
		return time.Duration(value) * 24 * time.Hour, nil
	case "w":
		return time.Duration(value) * 7 * 24 * time.Hour, nil
	case "mo":
		return time.Duration(value) * 30 * 24 * time.Hour, nil
	case "y":
		return time.Duration(value) * 365 * 24 * time.Hour, nil
	default:
		return 0, errors.New("invalid expiration unit")
	}
}

func maskAPIKey(key string) string {
	if len(key) <= 8 {
		return strings.Repeat("*", len(key))
	}
	return key[:4] + strings.Repeat("*", len(key)-8) + key[len(key)-4:]
}

func (m *APIKeyManager) toAPIKeyResponse(apiKey *APIKey) APIKeyResponse {
	return APIKeyResponse{
		ID:            apiKey.ID,
		MaskedKey:     maskAPIKey(apiKey.ID),
		Name:          apiKey.Name,
		Expiration:    apiKey.Expiration,
		RPM:           apiKey.RPM,
		ThreadsLimit:  apiKey.ThreadsLimit,
		TotalRequests: apiKey.TotalRequests,
		UsageCount:    apiKey.UsageCount,
		CreatedAt:     apiKey.CreatedAt,
		UpdatedAt:     apiKey.UpdatedAt,
		IsActive:      apiKey.IsActive,
	}
}

func (m *APIKeyManager) withRetry(operation func() error) error {
	var lastErr error
	for i := 0; i < m.config.MaxRetries; i++ {
		err := operation()
		if err == nil {
			return nil
		}
		lastErr = err
		if i < m.config.MaxRetries-1 {
			select {
			case <-time.After(time.Duration(m.config.RetryDelay) * time.Millisecond * time.Duration(i+1)):
			case <-m.ctx.Done():
				return m.ctx.Err()
			}
		}
	}
	return lastErr
}

func (m *APIKeyManager) SaveAPIKey(apiKey *APIKey) error {
	if err := m.ensureMongoConnection(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
	defer cancel()

	apiKey.UpdatedAt = time.Now().UTC()
	_, err := m.apiKeysCollection.ReplaceOne(ctx, bson.M{"_id": apiKey.ID}, apiKey, options.Replace().SetUpsert(true))
	return err
}

func (m *APIKeyManager) generateAPIKey(req CreateKeyRequest) (*APIKey, error) {
	expirationDuration, err := parseExpiration(req.Expiration)
	if err != nil {
		return nil, err
	}

	var keyID string
	if req.CustomKey != "" {
		if len(req.CustomKey) < 16 || len(req.CustomKey) > 64 {
			return nil, errors.New("custom key must be between 16 and 64 characters")
		}
		if _, exists := m.cache.GetAPIKey(req.CustomKey); exists {
			return nil, errors.New("custom API key already exists")
		}
		keyID = req.CustomKey
	} else {
		for i := 0; i < 5; i++ {
			keyID, err = generateRandomKey(32)
			if err != nil {
				return nil, err
			}
			if _, exists := m.cache.GetAPIKey(keyID); !exists {
				break
			}
			keyID = ""
		}
		if keyID == "" {
			return nil, errors.New("failed to generate a unique API key")
		}
	}

	now := time.Now().UTC()
	apiKey := &APIKey{
		ID:            keyID,
		Name:          req.Name,
		Expiration:    now.Add(expirationDuration),
		RPM:           req.RPM,
		ThreadsLimit:  req.ThreadsLimit,
		TotalRequests: req.TotalRequests,
		UsageCount:    0,
		CreatedAt:     now,
		UpdatedAt:     now,
		IsActive:      true,
	}

	if err = m.SaveAPIKey(apiKey); err != nil {
		return nil, err
	}

	m.cache.SetAPIKey(apiKey)

	m.logMessage("INFO", "API Key generated", "component", "apikey", "keyId", maskAPIKey(apiKey.ID), "name", apiKey.Name)
	m.broadcastEvent(WSMessage{
		Type: "key_created",
		Data: m.toAPIKeyResponse(apiKey),
	})

	return apiKey, nil
}

func (m *APIKeyManager) corsMiddleware() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-Requested-With"}
	config.ExposeHeaders = []string{"Content-Length"}
	config.AllowCredentials = true
	return cors.New(config)
}

func (m *APIKeyManager) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		token := c.GetHeader("Authorization")
		if token == "" {
			log.Printf("Missing Authorization header from %s", c.ClientIP())
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		if strings.HasPrefix(token, "Bearer ") {
			token = token[7:]
		}

		claims := jwt.MapClaims{}
		parsedToken, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(m.config.JWTSecret), nil
		})

		if err != nil || !parsedToken.Valid {
			log.Printf("Invalid token from %s: %v", c.ClientIP(), err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Set("claims", claims)
		c.Next()
	}
}

func (m *APIKeyManager) loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Invalid login request format from %s: %v", c.ClientIP(), err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	log.Printf("Login attempt from %s", c.ClientIP())

	if req.Password != m.config.AdminPassword {
		log.Printf("Failed login attempt from %s", c.ClientIP())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"exp": expiresAt.Unix(),
		"iat": time.Now().Unix(),
		"sub": "admin",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(m.config.JWTSecret))
	if err != nil {
		log.Printf("Failed to generate token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate authentication token"})
		return
	}

	log.Printf("Successful login from %s", c.ClientIP())
	c.JSON(http.StatusOK, TokenResponse{
		Token:     tokenString,
		ExpiresAt: expiresAt.Unix(),
	})
}

func (m *APIKeyManager) healthHandler(c *gin.Context) {
	mongoStatus := m.isMongoConnected()
	if mongoStatus {
		ctx, cancel := context.WithTimeout(m.ctx, 2*time.Second)
		defer cancel()
		if err := m.mongoClient.Ping(ctx, readpref.Primary()); err != nil {
			mongoStatus = false
			m.setMongoStatus(false)
		}
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	keys := m.cache.ListKeys()
	activeKeys := int64(0)
	expiredKeys := int64(0)
	now := time.Now().UTC()

	for _, key := range keys {
		if key.IsActive && key.Expiration.After(now) {
			activeKeys++
		} else if key.Expiration.Before(now) {
			expiredKeys++
		}
	}

	stats := SystemStats{
		TotalKeys:    int64(len(keys)),
		ActiveKeys:   activeKeys,
		ExpiredKeys:  expiredKeys,
		Uptime:       int64(time.Since(m.startTime).Seconds()),
		MemoryUsage:  int64(memStats.Alloc),
		GoRoutines:   runtime.NumGoroutine(),
		MongoStatus:  mongoStatus,
		CacheHitRate: m.cache.GetHitRate(),
	}

	status := "healthy"
	httpStatus := http.StatusOK
	if !mongoStatus {
		status = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}

	c.JSON(httpStatus, gin.H{
		"status": status,
		"stats":  stats,
	})
}

func (m *APIKeyManager) createAPIKeyHandler(c *gin.Context) {
	var req CreateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Invalid create key request from %s: %v", c.ClientIP(), err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data. Please check your input."})
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "API key name is required"})
		return
	}

	if req.Expiration == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Expiration is required"})
		return
	}

	if req.RPM < 0 || req.RPM > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "RPM must be between 0 and 10000"})
		return
	}

	if req.ThreadsLimit < 0 || req.ThreadsLimit > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Threads limit must be between 0 and 1000"})
		return
	}

	if req.TotalRequests < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Total requests must be greater than or equal to 0"})
		return
	}

	apiKey, err := m.generateAPIKey(req)
	if err != nil {
		log.Printf("Failed to create API key for %s: %v", c.ClientIP(), err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("API key created successfully for %s", c.ClientIP())
	c.JSON(http.StatusOK, ApiResponse{
		Data:    m.toAPIKeyResponse(apiKey),
		Message: "API key created successfully",
	})
}

func (m *APIKeyManager) listAPIKeysHandler(c *gin.Context) {
	log.Printf("API Keys request from %s", c.ClientIP())

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}

	keys := m.cache.ListKeys()
	var response []APIKeyResponse
	for _, key := range keys {
		response = append(response, m.toAPIKeyResponse(&key))
	}

	total := len(response)
	start := (page - 1) * limit
	end := start + limit
	if start >= total {
		response = []APIKeyResponse{}
	} else {
		if end > total {
			end = total
		}
		response = response[start:end]
	}

	log.Printf("Returning %d API keys to %s", len(response), c.ClientIP())

	pagination := &PaginationInfo{
		Page:       page,
		Limit:      limit,
		Total:      int64(total),
		TotalPages: (total + limit - 1) / limit,
	}

	c.JSON(http.StatusOK, ApiResponse{
		Data:       response,
		Pagination: pagination,
	})
}

func (m *APIKeyManager) getAPIKeyHandler(c *gin.Context) {
	keyID := c.Param("id")
	if keyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Key ID is required"})
		return
	}

	apiKey, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	c.JSON(http.StatusOK, ApiResponse{
		Data: m.toAPIKeyResponse(apiKey),
	})
}

func (m *APIKeyManager) updateAPIKeyHandler(c *gin.Context) {
	keyID := c.Param("id")
	if keyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Key ID is required"})
		return
	}

	var req UpdateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	apiKey, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	if req.Name != nil {
		if strings.TrimSpace(*req.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "API key name cannot be empty"})
			return
		}
		apiKey.Name = strings.TrimSpace(*req.Name)
	}
	if req.RPM != nil {
		if *req.RPM < 0 || *req.RPM > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "RPM must be between 0 and 10000"})
			return
		}
		apiKey.RPM = *req.RPM
	}
	if req.ThreadsLimit != nil {
		if *req.ThreadsLimit < 0 || *req.ThreadsLimit > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Threads limit must be between 0 and 1000"})
			return
		}
		apiKey.ThreadsLimit = *req.ThreadsLimit
	}
	if req.TotalRequests != nil {
		if *req.TotalRequests < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Total requests must be greater than or equal to 0"})
			return
		}
		apiKey.TotalRequests = *req.TotalRequests
	}
	if req.IsActive != nil {
		apiKey.IsActive = *req.IsActive
	}
	if req.Expiration != nil {
		expirationDuration, err := parseExpiration(*req.Expiration)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid expiration format"})
			return
		}
		apiKey.Expiration = time.Now().UTC().Add(expirationDuration)
	}

	if err := m.SaveAPIKey(apiKey); err != nil {
		log.Printf("Failed to update API key %s: %v", keyID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update API key"})
		return
	}

	m.cache.SetAPIKey(apiKey)

	m.logMessage("INFO", "API Key updated", "component", "apikey", "keyId", maskAPIKey(apiKey.ID), "name", apiKey.Name)
	m.broadcastEvent(WSMessage{
		Type: "key_updated",
		Data: m.toAPIKeyResponse(apiKey),
	})

	c.JSON(http.StatusOK, ApiResponse{
		Data:    m.toAPIKeyResponse(apiKey),
		Message: "API key updated successfully",
	})
}

func (m *APIKeyManager) deleteAPIKeyHandler(c *gin.Context) {
	keyID := c.Param("id")
	if keyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Key ID is required"})
		return
	}

	_, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
		defer cancel()
		_, err := m.apiKeysCollection.DeleteOne(ctx, bson.M{"_id": keyID})
		return err
	})

	if err != nil {
		log.Printf("Failed to delete API key %s: %v", keyID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete API key"})
		return
	}

	m.cache.DeleteAPIKey(keyID)

	m.logMessage("INFO", "API Key deleted", "component", "apikey", "keyId", maskAPIKey(keyID))
	m.broadcastEvent(WSMessage{
		Type: "key_deleted",
		Data: gin.H{"id": keyID},
	})

	c.JSON(http.StatusOK, gin.H{"message": "API key deleted successfully"})
}

func (m *APIKeyManager) cleanExpiredKeysHandler(c *gin.Context) {
	now := time.Now().UTC()
	var deletedCount int64

	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(m.ctx, 30*time.Second)
		defer cancel()

		filter := bson.M{"expiration": bson.M{"$lt": now}}

		cursor, err := m.apiKeysCollection.Find(ctx, filter)
		if err != nil {
			return err
		}
		defer cursor.Close(ctx)

		var expiredKeys []string
		for cursor.Next(ctx) {
			var result struct {
				ID string `bson:"_id"`
			}
			if err := cursor.Decode(&result); err != nil {
				continue
			}
			expiredKeys = append(expiredKeys, result.ID)
		}

		if len(expiredKeys) == 0 {
			return nil
		}

		res, err := m.apiKeysCollection.DeleteMany(ctx, filter)
		if err != nil {
			return err
		}
		deletedCount = res.DeletedCount

		for _, keyID := range expiredKeys {
			m.cache.DeleteAPIKey(keyID)
		}

		return nil
	})

	if err != nil {
		log.Printf("Failed to clean expired keys: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clean expired keys"})
		return
	}

	m.logMessage("INFO", "Cleaned expired API keys", "component", "cleanup", "count", deletedCount)
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Successfully cleaned %d expired API keys", deletedCount),
		"count":   deletedCount,
	})
}

func (m *APIKeyManager) getLogsHandler(c *gin.Context) {
	log.Printf("Logs request from %s", c.ClientIP())

	if !m.isMongoConnected() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database connection unavailable"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	level := c.Query("level")
	component := c.Query("component")
	search := c.Query("search")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 1000 {
		limit = 100
	}

	filter := bson.M{}
	if level != "" && level != "all" {
		filter["level"] = level
	}
	if component != "" && component != "all" {
		filter["component"] = component
	}
	if search != "" {
		filter["$or"] = []bson.M{
			{"message": bson.M{"$regex": search, "$options": "i"}},
			{"component": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	ctx, cancel := context.WithTimeout(m.ctx, 10*time.Second)
	defer cancel()

	totalCount, err := m.logsCollection.CountDocuments(ctx, filter)
	if err != nil {
		log.Printf("Error counting logs: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count logs"})
		return
	}

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	opts := options.Find().
		SetSort(bson.D{{Key: "timestamp", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	cursor, err := m.logsCollection.Find(ctx, filter, opts)
	if err != nil {
		log.Printf("Error finding logs: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve logs"})
		return
	}
	defer cursor.Close(ctx)

	var logs []LogEntry
	if err := cursor.All(ctx, &logs); err != nil {
		log.Printf("Error decoding logs: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode logs"})
		return
	}

	if logs == nil {
		logs = []LogEntry{}
	}

	pagination := &PaginationInfo{
		Page:       page,
		Limit:      limit,
		Total:      totalCount,
		TotalPages: totalPages,
	}

	c.JSON(http.StatusOK, ApiResponse{
		Data:       logs,
		Pagination: pagination,
	})
}

func (m *APIKeyManager) wsHandler(c *gin.Context) {
	log.Printf("WebSocket connection attempt from %s", c.ClientIP())

	token := c.Query("token")
	if token == "" {
		log.Printf("Missing token in WebSocket query from %s", c.ClientIP())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Token required for WebSocket connection"})
		return
	}

	claims := jwt.MapClaims{}
	parsedToken, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(m.config.JWTSecret), nil
	})

	if err != nil || !parsedToken.Valid {
		log.Printf("Invalid WebSocket token from %s: %v", c.ClientIP(), err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
		return
	}

	conn, err := m.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed for %s: %v", c.ClientIP(), err)
		return
	}

	clientID := generateClientID()
	m.wsClients.Store(clientID, conn)

	log.Printf("WebSocket client %s connected from %s", clientID, c.ClientIP())

	go func() {
		defer func() {
			m.wsClients.Delete(clientID)
			conn.Close()
			log.Printf("WebSocket client %s disconnected", clientID)
		}()

		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		for {
			select {
			case <-m.ctx.Done():
				return
			default:
				_, _, err := conn.ReadMessage()
				if err != nil {
					if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
						log.Printf("WebSocket unexpected close error: %v", err)
					}
					return
				}
			}
		}
	}()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Failed to send ping to client %s: %v", clientID, err)
				return
			}
		case <-m.ctx.Done():
			return
		}
	}
}

func generateClientID() string {
	id, _ := generateRandomKey(16)
	return id
}

func (m *APIKeyManager) broadcastEvent(event WSMessage) {
	select {
	case m.eventChan <- event:
	default:
		log.Printf("Event channel full, dropping event")
	}
}

func (m *APIKeyManager) eventBroadcaster() {
	go func() {
		log.Printf("Event broadcaster started")
		for {
			select {
			case event := <-m.eventChan:
				clientCount := 0
				m.wsClients.Range(func(key, value interface{}) bool {
					if conn, ok := value.(*websocket.Conn); ok {
						conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
						if err := conn.WriteJSON(event); err != nil {
							log.Printf("Failed to send event to client %v: %v", key, err)
							m.wsClients.Delete(key)
						} else {
							clientCount++
						}
					}
					return true
				})
				if clientCount > 0 {
					log.Printf("Broadcasted event to %d clients", clientCount)
				}
			case <-m.ctx.Done():
				log.Printf("Event broadcaster stopping")
				return
			}
		}
	}()
}

func (m *APIKeyManager) logMessage(level, message string, args ...interface{}) {
	log.Printf("[%s] %s", level, message)

	if !m.isMongoConnected() {
		return
	}

	metadata := bson.M{}
	for i := 0; i < len(args); i += 2 {
		if i+1 < len(args) {
			key := fmt.Sprintf("%v", args[i])
			value := args[i+1]
			metadata[key] = value
		}
	}

	logEntry := LogEntry{
		Level:     level,
		Message:   message,
		Component: "system",
		Timestamp: time.Now().UTC(),
		Metadata:  metadata,
	}

	if component, ok := metadata["component"]; ok {
		logEntry.Component = fmt.Sprintf("%v", component)
		delete(metadata, "component")
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if _, err := m.logsCollection.InsertOne(ctx, logEntry); err != nil {
			log.Printf("Failed to insert log entry: %v", err)
			return
		}

		m.broadcastEvent(WSMessage{
			Type: "log_entry",
			Data: logEntry,
		})
	}()
}

func (m *APIKeyManager) shutdown() {
	m.shutdownOnce.Do(func() {
		log.Printf("Starting graceful shutdown...")

		m.cancel()

		m.wsClients.Range(func(key, value interface{}) bool {
			if conn, ok := value.(*websocket.Conn); ok {
				conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseGoingAway, "Server shutting down"))
				conn.Close()
			}
			m.wsClients.Delete(key)
			return true
		})

		close(m.eventChan)

		if m.mongoClient != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			m.mongoClient.Disconnect(ctx)
		}

		log.Printf("Shutdown complete")
	})
}

func main() {
	log.Printf("Starting API Key Manager Server...")

	runtime.GOMAXPROCS(runtime.NumCPU())
	gin.SetMode(gin.ReleaseMode)

	config, err := loadConfig("server.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	log.Printf("Configuration loaded: Port=%s, DB=%s", config.ServerPort, config.DatabaseName)

	manager := NewAPIKeyManager(config)

	if err := manager.connectMongo(); err != nil {
		log.Printf("MongoDB connection failed: %v", err)
		log.Printf("Server will start but database features will be limited")
	}

	if err := manager.loadAPIKeysToCache(); err != nil {
		log.Printf("Failed to load API keys to cache: %v", err)
	}

	manager.eventBroadcaster()

	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(manager.corsMiddleware())

	staticFS, err := static.EmbedFolder(staticFiles, "frontend/dist")
	if err != nil {
		log.Printf("Error creating static file system: %v", err)
	} else {
		router.Use(static.Serve("/", staticFS))
	}

	router.POST("/api/v1/auth/login", manager.loginHandler)
	router.GET("/api/v1/health", manager.healthHandler)
	router.GET("/api/v1/ws", manager.wsHandler)

	api := router.Group("/api/v1")
	api.Use(manager.authMiddleware())
	{
		api.POST("/keys", manager.createAPIKeyHandler)
		api.GET("/keys", manager.listAPIKeysHandler)
		api.GET("/keys/:id", manager.getAPIKeyHandler)
		api.PUT("/keys/:id", manager.updateAPIKeyHandler)
		api.DELETE("/keys/:id", manager.deleteAPIKeyHandler)
		api.POST("/keys/clean", manager.cleanExpiredKeysHandler)
		api.GET("/logs", manager.getLogsHandler)
	}

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API endpoint not found"})
		} else {
			indexHTML, err := staticFiles.ReadFile("frontend/dist/index.html")
			if err != nil {
				c.String(http.StatusNotFound, "404 page not found")
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
		}
	})

	server := &http.Server{
		Addr:         ":" + config.ServerPort,
		Handler:      router,
		ReadTimeout:  time.Duration(config.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(config.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(config.IdleTimeout) * time.Second,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Printf("Server is ready and listening on http://localhost:%s", config.ServerPort)
	log.Printf("Health check: http://localhost:%s/api/v1/health", config.ServerPort)
	log.Printf("Admin login required for management interface")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	manager.shutdown()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
