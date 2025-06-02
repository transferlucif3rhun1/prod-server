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
	"time"

	"github.com/fsnotify/fsnotify"
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

type FixedWindowRateLimiter struct {
	windowStart int64
	count       int64
	limit       int64
	mutex       sync.Mutex
}

func NewFixedWindowRateLimiter(limit int) *FixedWindowRateLimiter {
	return &FixedWindowRateLimiter{
		windowStart: time.Now().UTC().Unix(),
		limit:       int64(limit),
	}
}

func (fw *FixedWindowRateLimiter) Allow() bool {
	fw.mutex.Lock()
	defer fw.mutex.Unlock()

	now := time.Now().UTC().Unix()
	if now-fw.windowStart >= 60 {
		fw.windowStart = now
		fw.count = 1
		return true
	}

	if fw.count < fw.limit {
		fw.count++
		return true
	}

	return false
}

type CircuitBreaker struct {
	maxFailures int
	failures    int
	lastFailure time.Time
	timeout     time.Duration
	mutex       sync.RWMutex
}

func NewCircuitBreaker(maxFailures int, timeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		maxFailures: maxFailures,
		timeout:     timeout,
	}
}

func (cb *CircuitBreaker) Call(fn func() error) error {
	cb.mutex.RLock()
	if cb.failures >= cb.maxFailures {
		if time.Since(cb.lastFailure) < cb.timeout {
			cb.mutex.RUnlock()
			return errors.New("circuit breaker open")
		}
	}
	cb.mutex.RUnlock()

	err := fn()

	cb.mutex.Lock()
	defer cb.mutex.Unlock()

	if err != nil {
		cb.failures++
		cb.lastFailure = time.Now()
	} else {
		cb.failures = 0
	}

	return err
}

type APIKeyManager struct {
	mongoClient       *mongo.Client
	apiKeysCollection *mongo.Collection
	logsCollection    *mongo.Collection
	cache             *Cache
	config            *Config
	configMutex       sync.RWMutex
	rateLimiters      sync.Map
	stopChan          chan struct{}
	wg                sync.WaitGroup
	circuitBreaker    *CircuitBreaker
	startTime         time.Time
	upgrader          websocket.Upgrader
	wsClients         sync.Map
	eventChan         chan interface{}
}

func NewAPIKeyManager(config *Config) *APIKeyManager {
	return &APIKeyManager{
		cache:          &Cache{},
		config:         config,
		stopChan:       make(chan struct{}),
		circuitBreaker: NewCircuitBreaker(5, 30*time.Second),
		startTime:      time.Now(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		eventChan: make(chan interface{}, 100),
	}
}

func loadConfig(filePath string) (*Config, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	config := &Config{}
	if err := decoder.Decode(config); err != nil {
		return nil, err
	}

	if config.MaxRetries == 0 {
		config.MaxRetries = 3
	}
	if config.RetryDelay == 0 {
		config.RetryDelay = 1000
	}
	return config, nil
}

func (m *APIKeyManager) watchConfigAndReload(filePath string) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		m.logError("Failed to create file watcher", err, "component", "config")
		return
	}
	defer watcher.Close()

	if err := watcher.Add(filePath); err != nil {
		m.logError("Failed to add file to watcher", err, "component", "config")
		return
	}

	for {
		select {
		case event := <-watcher.Events:
			if event.Op&fsnotify.Write == fsnotify.Write {
				newConfig, err := loadConfig(filePath)
				if err == nil {
					m.configMutex.Lock()
					m.config = newConfig
					m.configMutex.Unlock()
					m.logInfo("Configuration reloaded successfully", "component", "config")
				} else {
					m.logError("Failed to reload configuration", err, "component", "config")
				}
			}
		case err := <-watcher.Errors:
			m.logError("Watcher error", err, "component", "config")
		case <-m.stopChan:
			return
		}
	}
}

func (m *APIKeyManager) connectMongo() error {
	clientOptions := options.Client().
		ApplyURI(m.config.MongoURI).
		SetMaxPoolSize(100).
		SetMinPoolSize(10).
		SetRetryWrites(true).
		SetRetryReads(true)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	m.mongoClient, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %v", err)
	}

	ctxPing, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelPing()

	if err = m.mongoClient.Ping(ctxPing, readpref.Primary()); err != nil {
		return fmt.Errorf("failed to ping MongoDB: %v", err)
	}

	m.apiKeysCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.ApiKeysCollection)
	m.logsCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.LogsCollection)

	m.logInfo("Connected to MongoDB", "component", "mongodb")
	return nil
}

func (m *APIKeyManager) withRetry(operation func() error) error {
	var lastErr error
	for i := 0; i < m.config.MaxRetries; i++ {
		err := m.circuitBreaker.Call(operation)
		if err == nil {
			return nil
		}
		lastErr = err
		if i < m.config.MaxRetries-1 {
			time.Sleep(time.Duration(m.config.RetryDelay) * time.Millisecond * time.Duration(i+1))
		}
	}
	return lastErr
}

func (m *APIKeyManager) loadAPIKeysToCache() error {
	return m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
			if key.RPM > 0 {
				m.rateLimiters.Store(key.ID, NewFixedWindowRateLimiter(key.RPM))
			}
			count++
		}

		m.logInfo("Loaded API keys to cache", "component", "cache", "count", count)
		return cursor.Err()
	})
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
	if req.RPM > 0 {
		m.rateLimiters.Store(apiKey.ID, NewFixedWindowRateLimiter(req.RPM))
	}

	m.logInfo("API Key generated", "component", "apikey", "keyId", maskAPIKey(apiKey.ID), "name", apiKey.Name)
	m.broadcastEvent(map[string]interface{}{
		"type": "key_created",
		"data": m.toAPIKeyResponse(apiKey),
	})

	return apiKey, nil
}

func (m *APIKeyManager) SaveAPIKey(apiKey *APIKey) error {
	return m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		apiKey.UpdatedAt = time.Now().UTC()
		_, err := m.apiKeysCollection.ReplaceOne(ctx, bson.M{"_id": apiKey.ID}, apiKey, options.Replace().SetUpsert(true))
		return err
	})
}

func (m *APIKeyManager) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		if strings.HasPrefix(token, "Bearer ") {
			token = token[7:]
		}

		claims := jwt.MapClaims{}
		_, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(m.config.JWTSecret), nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Next()
	}
}

func (m *APIKeyManager) validationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Next()
	}
}

func (m *APIKeyManager) loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if req.Password != m.config.AdminPassword {
		m.logWarn("Failed login attempt", "component", "auth", "ip", c.ClientIP())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	m.logInfo("Successful login", "component", "auth", "ip", c.ClientIP())
	c.JSON(http.StatusOK, TokenResponse{
		Token:     tokenString,
		ExpiresAt: expiresAt.Unix(),
	})
}

func (m *APIKeyManager) healthHandler(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mongoStatus := true
	if err := m.mongoClient.Ping(ctx, readpref.Primary()); err != nil {
		mongoStatus = false
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	stats := SystemStats{
		TotalKeys:    int64(len(m.cache.ListKeys())),
		ActiveKeys:   m.getActiveKeysCount(),
		ExpiredKeys:  m.getExpiredKeysCount(),
		Uptime:       int64(time.Since(m.startTime).Seconds()),
		MemoryUsage:  int64(memStats.Alloc),
		GoRoutines:   runtime.NumGoroutine(),
		MongoStatus:  mongoStatus,
		CacheHitRate: m.cache.GetHitRate(),
	}

	status := http.StatusOK
	if !mongoStatus {
		status = http.StatusServiceUnavailable
	}

	c.JSON(status, gin.H{
		"status": "ok",
		"stats":  stats,
	})
}

func (m *APIKeyManager) getActiveKeysCount() int64 {
	var count int64
	now := time.Now().UTC()
	keys := m.cache.ListKeys()
	for _, key := range keys {
		if key.IsActive && key.Expiration.After(now) {
			count++
		}
	}
	return count
}

func (m *APIKeyManager) getExpiredKeysCount() int64 {
	var count int64
	now := time.Now().UTC()
	keys := m.cache.ListKeys()
	for _, key := range keys {
		if key.Expiration.Before(now) {
			count++
		}
	}
	return count
}

func (m *APIKeyManager) createAPIKeyHandler(c *gin.Context) {
	var req CreateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
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

	apiKey, err := m.generateAPIKey(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "API Key created successfully",
		"data":    m.toAPIKeyResponse(apiKey),
	})
}

func (m *APIKeyManager) listAPIKeysHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}

	filter := c.Query("filter")
	search := c.Query("search")

	keys := m.cache.ListKeys()
	var filteredKeys []APIKey

	now := time.Now().UTC()
	for _, key := range keys {
		if filter == "active" && (!key.IsActive || key.Expiration.Before(now)) {
			continue
		}
		if filter == "expired" && key.Expiration.After(now) {
			continue
		}
		if filter == "inactive" && key.IsActive {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(key.Name), strings.ToLower(search)) &&
			!strings.Contains(strings.ToLower(key.ID), strings.ToLower(search)) {
			continue
		}
		filteredKeys = append(filteredKeys, key)
	}

	total := len(filteredKeys)
	start := (page - 1) * limit
	end := start + limit
	if start >= total {
		filteredKeys = []APIKey{}
	} else {
		if end > total {
			end = total
		}
		filteredKeys = filteredKeys[start:end]
	}

	var response []APIKeyResponse
	for _, key := range filteredKeys {
		response = append(response, m.toAPIKeyResponse(&key))
	}

	c.JSON(http.StatusOK, gin.H{
		"data": response,
		"pagination": gin.H{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + limit - 1) / limit,
		},
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

	c.JSON(http.StatusOK, gin.H{"data": m.toAPIKeyResponse(apiKey)})
}

func (m *APIKeyManager) updateAPIKeyHandler(c *gin.Context) {
	keyID := c.Param("id")
	if keyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Key ID is required"})
		return
	}

	var req UpdateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	apiKey, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	original := *apiKey

	if req.Name != nil {
		apiKey.Name = *req.Name
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
		apiKey.TotalRequests = *req.TotalRequests
	}
	if req.IsActive != nil {
		apiKey.IsActive = *req.IsActive
	}
	if req.Expiration != nil {
		expirationDuration, err := parseExpiration(*req.Expiration)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if apiKey.Expiration.Before(time.Now().UTC()) {
			apiKey.Expiration = time.Now().UTC().Add(expirationDuration)
		} else {
			apiKey.Expiration = apiKey.Expiration.Add(expirationDuration)
		}
	}

	if err := m.SaveAPIKey(apiKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update API key"})
		return
	}

	m.cache.SetAPIKey(apiKey)
	if apiKey.RPM > 0 {
		m.rateLimiters.Store(apiKey.ID, NewFixedWindowRateLimiter(apiKey.RPM))
	} else {
		m.rateLimiters.Delete(apiKey.ID)
	}

	m.logInfo("API Key updated", "component", "apikey", "keyId", maskAPIKey(apiKey.ID), "name", apiKey.Name)
	m.broadcastEvent(map[string]interface{}{
		"type":    "key_updated",
		"data":    m.toAPIKeyResponse(apiKey),
		"changes": m.getChanges(&original, apiKey),
	})

	c.JSON(http.StatusOK, gin.H{
		"message": "API Key updated successfully",
		"data":    m.toAPIKeyResponse(apiKey),
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
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, err := m.apiKeysCollection.DeleteOne(ctx, bson.M{"_id": keyID})
		return err
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete API key"})
		return
	}

	m.cache.DeleteAPIKey(keyID)
	m.rateLimiters.Delete(keyID)

	m.logInfo("API Key deleted", "component", "apikey", "keyId", maskAPIKey(keyID))
	m.broadcastEvent(map[string]interface{}{
		"type": "key_deleted",
		"data": gin.H{"id": keyID},
	})

	c.JSON(http.StatusOK, gin.H{"message": "API key deleted successfully"})
}

func (m *APIKeyManager) cleanExpiredKeysHandler(c *gin.Context) {
	now := time.Now().UTC()

	var expiredKeys []string
	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		filter := bson.M{"expiration": bson.M{"$lt": now}}
		cursor, err := m.apiKeysCollection.Find(ctx, filter)
		if err != nil {
			return err
		}
		defer cursor.Close(ctx)

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

		for _, keyID := range expiredKeys {
			m.cache.DeleteAPIKey(keyID)
			m.rateLimiters.Delete(keyID)
		}

		m.logInfo("Cleaned expired API keys", "component", "cleanup", "count", res.DeletedCount)
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clean expired keys"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Expired keys cleaned successfully"})
}

func (m *APIKeyManager) getLogsHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 1000 {
		limit = 100
	}

	level := c.Query("level")
	component := c.Query("component")
	search := c.Query("search")

	filter := bson.M{}
	if level != "" {
		filter["level"] = level
	}
	if component != "" {
		filter["component"] = component
	}
	if search != "" {
		filter["message"] = bson.M{"$regex": search, "$options": "i"}
	}

	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		totalCount, err := m.logsCollection.CountDocuments(ctx, filter)
		if err != nil {
			return err
		}

		opts := options.Find().
			SetSort(bson.D{{Key: "timestamp", Value: -1}}).
			SetSkip(int64((page - 1) * limit)).
			SetLimit(int64(limit))

		cursor, err := m.logsCollection.Find(ctx, filter, opts)
		if err != nil {
			return err
		}
		defer cursor.Close(ctx)

		var logs []LogEntry
		if err := cursor.All(ctx, &logs); err != nil {
			return err
		}

		c.JSON(http.StatusOK, gin.H{
			"data": logs,
			"pagination": gin.H{
				"page":       page,
				"limit":      limit,
				"total":      totalCount,
				"totalPages": (totalCount + int64(limit) - 1) / int64(limit),
			},
		})
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve logs"})
	}
}

func (m *APIKeyManager) wsHandler(c *gin.Context) {
	conn, err := m.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		m.logError("WebSocket upgrade failed", err, "component", "websocket")
		return
	}
	defer conn.Close()

	clientID := generateClientID()
	m.wsClients.Store(clientID, conn)
	defer m.wsClients.Delete(clientID)

	m.logInfo("WebSocket client connected", "component", "websocket", "clientId", clientID)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			m.logInfo("WebSocket client disconnected", "component", "websocket", "clientId", clientID)
			break
		}
	}
}

func generateClientID() string {
	id, _ := generateRandomKey(16)
	return id
}

func (m *APIKeyManager) broadcastEvent(event interface{}) {
	select {
	case m.eventChan <- event:
	default:
	}
}

func (m *APIKeyManager) eventBroadcaster() {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		for {
			select {
			case event := <-m.eventChan:
				m.wsClients.Range(func(key, value interface{}) bool {
					if conn, ok := value.(*websocket.Conn); ok {
						if err := conn.WriteJSON(event); err != nil {
							m.wsClients.Delete(key)
						}
					}
					return true
				})
			case <-m.stopChan:
				return
			}
		}
	}()
}

func (m *APIKeyManager) getChanges(original, updated *APIKey) []string {
	var changes []string
	if original.Name != updated.Name {
		changes = append(changes, fmt.Sprintf("Name: %s -> %s", original.Name, updated.Name))
	}
	if !original.Expiration.Equal(updated.Expiration) {
		changes = append(changes, fmt.Sprintf("Expiration: %s -> %s",
			original.Expiration.Format(time.RFC3339), updated.Expiration.Format(time.RFC3339)))
	}
	if original.RPM != updated.RPM {
		changes = append(changes, fmt.Sprintf("RPM: %d -> %d", original.RPM, updated.RPM))
	}
	if original.ThreadsLimit != updated.ThreadsLimit {
		changes = append(changes, fmt.Sprintf("ThreadsLimit: %d -> %d", original.ThreadsLimit, updated.ThreadsLimit))
	}
	if original.TotalRequests != updated.TotalRequests {
		changes = append(changes, fmt.Sprintf("TotalRequests: %d -> %d", original.TotalRequests, updated.TotalRequests))
	}
	if original.IsActive != updated.IsActive {
		changes = append(changes, fmt.Sprintf("IsActive: %t -> %t", original.IsActive, updated.IsActive))
	}
	return changes
}

func (m *APIKeyManager) logInfo(message string, args ...interface{}) {
	m.logMessage("INFO", message, args...)
}

func (m *APIKeyManager) logWarn(message string, args ...interface{}) {
	m.logMessage("WARN", message, args...)
}

func (m *APIKeyManager) logError(message string, err error, args ...interface{}) {
	allArgs := append(args, "error", err.Error())
	m.logMessage("ERROR", message, allArgs...)
}

func (m *APIKeyManager) logMessage(level, message string, args ...interface{}) {
	log.Printf("[%s] %s", level, message)

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
		m.logsCollection.InsertOne(ctx, logEntry)
	}()
}

func (m *APIKeyManager) watchMongoChanges() {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		for {
			select {
			case <-m.stopChan:
				return
			default:
				m.connectAndWatchChanges()
				time.Sleep(5 * time.Second)
			}
		}
	}()
}

func (m *APIKeyManager) connectAndWatchChanges() {
	ctx := context.Background()
	pipeline := mongo.Pipeline{}
	changeStreamOptions := options.ChangeStream().SetFullDocument(options.UpdateLookup)

	cs, err := m.apiKeysCollection.Watch(ctx, pipeline, changeStreamOptions)
	if err != nil {
		m.logError("Error watching MongoDB changes", err, "component", "mongodb")
		return
	}
	defer cs.Close(ctx)

	for {
		select {
		case <-m.stopChan:
			return
		default:
			if cs.Next(ctx) {
				var event struct {
					OperationType string `bson:"operationType"`
					FullDocument  APIKey `bson:"fullDocument"`
					DocumentKey   struct {
						ID string `bson:"_id"`
					} `bson:"documentKey"`
				}
				if err := cs.Decode(&event); err != nil {
					m.logError("Error decoding change stream document", err, "component", "mongodb")
					continue
				}

				keyID := event.DocumentKey.ID

				switch event.OperationType {
				case "insert", "replace", "update":
					fullDoc := event.FullDocument
					m.cache.SetAPIKey(&fullDoc)
					if fullDoc.RPM > 0 {
						m.rateLimiters.Store(fullDoc.ID, NewFixedWindowRateLimiter(fullDoc.RPM))
					} else {
						m.rateLimiters.Delete(fullDoc.ID)
					}
					m.logInfo("Cache updated for API key", "component", "cache", "keyId", maskAPIKey(keyID))
				case "delete":
					m.cache.DeleteAPIKey(keyID)
					m.rateLimiters.Delete(keyID)
					m.logInfo("API key deleted from cache", "component", "cache", "keyId", maskAPIKey(keyID))
				}
			} else if err := cs.Err(); err != nil {
				m.logError("Error reading change stream", err, "component", "mongodb")
				return
			}
		}
	}
}

func (m *APIKeyManager) shutdown(server *http.Server) {
	close(m.stopChan)
	m.wg.Wait()

	if m.mongoClient != nil {
		m.mongoClient.Disconnect(context.Background())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	server.Shutdown(ctx)

	m.logInfo("APIKeyManager shutdown complete", "component", "system")
}

func main() {
	runtime.GOMAXPROCS(runtime.NumCPU())
	gin.SetMode(gin.ReleaseMode)

	config, err := loadConfig("server.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	manager := NewAPIKeyManager(config)

	manager.wg.Add(1)
	go func() {
		defer manager.wg.Done()
		manager.watchConfigAndReload("server.json")
	}()

	if err := manager.connectMongo(); err != nil {
		log.Fatalf("Error connecting to MongoDB: %v", err)
	}

	if err := manager.loadAPIKeysToCache(); err != nil {
		manager.logError("Error loading API keys to cache", err, "component", "startup")
	}

	manager.watchMongoChanges()
	manager.eventBroadcaster()

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(manager.validationMiddleware())

	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	router.Use(cors.New(corsConfig))

	staticFS, err := static.EmbedFolder(staticFiles, "frontend/dist")
	if err != nil {
		log.Printf("Error creating static file system: %v", err)
	} else {
		router.Use(static.Serve("/", staticFS))
	}

	router.POST("/api/v1/auth/login", manager.loginHandler)
	router.GET("/api/v1/health", manager.healthHandler)

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
		api.GET("/ws", manager.wsHandler)
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
		Addr:         ":" + manager.config.ServerPort,
		Handler:      router,
		ReadTimeout:  time.Duration(manager.config.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(manager.config.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(manager.config.IdleTimeout) * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %s...", manager.config.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Printf("✅ Server is ready and listening on http://localhost:%s", manager.config.ServerPort)
	log.Printf("📊 Health check: http://localhost:%s/api/v1/health", manager.config.ServerPort)
	log.Printf("🔐 Admin login required for management interface")

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop

	manager.logInfo("Shutting down server", "component", "server")
	manager.shutdown(server)
}
