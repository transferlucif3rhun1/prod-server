package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

//go:embed frontend/dist
var staticFiles embed.FS

type Config struct {
	ServerPort        string `json:"serverPort" validate:"required"`
	MongoURI          string `json:"mongoURI" validate:"required"`
	DatabaseName      string `json:"databaseName" validate:"required"`
	ApiKeysCollection string `json:"apiKeysCollection" validate:"required"`
	LogsCollection    string `json:"logsCollection" validate:"required"`
	ReadTimeout       int    `json:"readTimeout" validate:"min=1,max=300"`
	WriteTimeout      int    `json:"writeTimeout" validate:"min=1,max=300"`
	IdleTimeout       int    `json:"idleTimeout" validate:"min=1,max=3600"`
	JWTSecret         string `json:"jwtSecret" validate:"required,min=32"`
	AdminPassword     string `json:"adminPassword" validate:"required,min=8"`
	MaxRetries        int    `json:"maxRetries" validate:"min=1,max=10"`
	RetryDelay        int    `json:"retryDelay" validate:"min=100,max=5000"`
	LogDir            string `json:"logDir"`
	MaxLogSize        int64  `json:"maxLogSize"`
	MaxLogFiles       int    `json:"maxLogFiles"`
}

type APIKey struct {
	ID            string                 `bson:"_id" json:"id" validate:"required"`
	Name          string                 `bson:"name,omitempty" json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	Expiration    time.Time              `bson:"expiration" json:"expiration" validate:"required"`
	RPM           int                    `bson:"rpm" json:"rpm" validate:"min=0,max=10000"`
	ThreadsLimit  int                    `bson:"threadsLimit" json:"threadsLimit" validate:"min=0,max=1000"`
	TotalRequests int64                  `bson:"totalRequests" json:"totalRequests" validate:"min=0"`
	UsageCount    int64                  `bson:"usageCount" json:"usageCount"`
	CreatedAt     time.Time              `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time              `bson:"updatedAt" json:"updatedAt"`
	IsActive      bool                   `bson:"isActive" json:"isActive"`
	LastUsed      *time.Time             `bson:"lastUsed,omitempty" json:"lastUsed,omitempty"`
	Metadata      map[string]interface{} `bson:"metadata,omitempty" json:"metadata,omitempty"`
}

type APIKeyResponse struct {
	ID            string     `json:"id"`
	MaskedKey     string     `json:"maskedKey"`
	Name          string     `json:"name,omitempty"`
	Expiration    time.Time  `json:"expiration"`
	RPM           int        `json:"rpm"`
	ThreadsLimit  int        `json:"threadsLimit"`
	TotalRequests int64      `json:"totalRequests"`
	UsageCount    int64      `json:"usageCount"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	IsActive      bool       `json:"isActive"`
	LastUsed      *time.Time `json:"lastUsed,omitempty"`
}

type LogEntry struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	Level     string             `bson:"level" json:"level" validate:"required,oneof=INFO WARN ERROR DEBUG"`
	Message   string             `bson:"message" json:"message" validate:"required,min=1,max=1000"`
	Component string             `bson:"component" json:"component" validate:"required,min=1,max=50"`
	Timestamp time.Time          `bson:"timestamp" json:"timestamp"`
	Metadata  bson.M             `bson:"metadata,omitempty" json:"metadata,omitempty"`
	UserID    string             `bson:"userId,omitempty" json:"userId,omitempty"`
}

type CreateKeyRequest struct {
	CustomKey     string `json:"customKey" validate:"omitempty,min=16,max=64,alphanum"`
	Name          string `json:"name" validate:"required,min=1,max=100"`
	RPM           int    `json:"rpm" validate:"min=0,max=10000"`
	ThreadsLimit  int    `json:"threadsLimit" validate:"min=0,max=1000"`
	TotalRequests int64  `json:"totalRequests" validate:"min=0"`
	Expiration    string `json:"expiration" validate:"required,min=2,max=10"`
}

type UpdateKeyRequest struct {
	Name          *string `json:"name,omitempty" validate:"omitempty,min=1,max=100"`
	RPM           *int    `json:"rpm,omitempty" validate:"omitempty,min=0,max=10000"`
	ThreadsLimit  *int    `json:"threadsLimit,omitempty" validate:"omitempty,min=0,max=1000"`
	TotalRequests *int64  `json:"totalRequests,omitempty" validate:"omitempty,min=0"`
	Expiration    *string `json:"expiration,omitempty" validate:"omitempty,min=2,max=10"`
	IsActive      *bool   `json:"isActive,omitempty"`
}

type LoginRequest struct {
	Password string `json:"password" validate:"required,min=1"`
}

type TokenResponse struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expiresAt"`
}

type WSMessage struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
	ID        string      `json:"id,omitempty"`
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
	Success    bool            `json:"success"`
	Timestamp  time.Time       `json:"timestamp"`
}

type ErrorResponse struct {
	Error     string    `json:"error"`
	Code      string    `json:"code,omitempty"`
	Details   string    `json:"details,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	RequestID string    `json:"requestId,omitempty"`
}

type HealthResponse struct {
	Status    string                 `json:"status"`
	Stats     map[string]interface{} `json:"stats"`
	Timestamp time.Time              `json:"timestamp"`
}

type CacheMetrics struct {
	hits   int64
	misses int64
}

type Cache struct {
	metrics     CacheMetrics
	keyToAPIKey sync.Map
	lastCleanup time.Time
	mutex       sync.RWMutex
}

func (c *Cache) GetAPIKey(key string) (*APIKey, bool) {
	value, exists := c.keyToAPIKey.Load(key)
	if !exists {
		atomic.AddInt64(&c.metrics.misses, 1)
		return nil, false
	}
	atomic.AddInt64(&c.metrics.hits, 1)
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
	hits := atomic.LoadInt64(&c.metrics.hits)
	misses := atomic.LoadInt64(&c.metrics.misses)
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

func (c *Cache) Size() int {
	count := 0
	c.keyToAPIKey.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}

func (c *Cache) Clear() {
	c.keyToAPIKey.Range(func(key, value interface{}) bool {
		c.keyToAPIKey.Delete(key)
		return true
	})
	atomic.StoreInt64(&c.metrics.hits, 0)
	atomic.StoreInt64(&c.metrics.misses, 0)
}

type FileLogger struct {
	logFile     *os.File
	currentSize int64
	maxSize     int64
	maxFiles    int
	logDir      string
	mu          sync.Mutex
}

func NewFileLogger(logDir string, maxSize int64, maxFiles int) (*FileLogger, error) {
	if logDir == "" {
		logDir = "logs"
	}
	if maxSize == 0 {
		maxSize = 10 * 1024 * 1024
	}
	if maxFiles == 0 {
		maxFiles = 5
	}

	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory: %w", err)
	}

	fl := &FileLogger{
		maxSize:  maxSize,
		maxFiles: maxFiles,
		logDir:   logDir,
	}

	if err := fl.openLogFile(); err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}

	go fl.cleanupRoutine()
	return fl, nil
}

func (fl *FileLogger) openLogFile() error {
	filename := filepath.Join(fl.logDir, fmt.Sprintf("app_%s.log", time.Now().Format("2006-01-02")))

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}

	if fl.logFile != nil {
		fl.logFile.Close()
	}

	fl.logFile = file

	if stat, err := file.Stat(); err == nil {
		fl.currentSize = stat.Size()
	}

	return nil
}

func (fl *FileLogger) Write(p []byte) (n int, err error) {
	fl.mu.Lock()
	defer fl.mu.Unlock()

	if fl.currentSize+int64(len(p)) > fl.maxSize {
		if err := fl.rotateLog(); err != nil {
			return 0, err
		}
	}

	n, err = fl.logFile.Write(p)
	if err == nil {
		fl.currentSize += int64(n)
	}
	return
}

func (fl *FileLogger) rotateLog() error {
	fl.logFile.Close()

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	oldName := fl.logFile.Name()
	newName := strings.Replace(oldName, ".log", fmt.Sprintf("_%s.log", timestamp), 1)

	if err := os.Rename(oldName, newName); err != nil {
		return err
	}

	fl.currentSize = 0
	return fl.openLogFile()
}

func (fl *FileLogger) cleanupRoutine() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		fl.cleanup()
	}
}

func (fl *FileLogger) cleanup() {
	files, err := filepath.Glob(filepath.Join(fl.logDir, "*.log"))
	if err != nil {
		return
	}

	if len(files) <= fl.maxFiles {
		return
	}

	type fileInfo struct {
		path    string
		modTime time.Time
	}

	var fileInfos []fileInfo
	for _, file := range files {
		if stat, err := os.Stat(file); err == nil {
			fileInfos = append(fileInfos, fileInfo{file, stat.ModTime()})
		}
	}

	if len(fileInfos) <= fl.maxFiles {
		return
	}

	for i := 0; i < len(fileInfos)-1; i++ {
		for j := i + 1; j < len(fileInfos); j++ {
			if fileInfos[i].modTime.After(fileInfos[j].modTime) {
				fileInfos[i], fileInfos[j] = fileInfos[j], fileInfos[i]
			}
		}
	}

	for i := 0; i < len(fileInfos)-fl.maxFiles; i++ {
		os.Remove(fileInfos[i].path)
	}
}

func (fl *FileLogger) Close() error {
	fl.mu.Lock()
	defer fl.mu.Unlock()
	if fl.logFile != nil {
		return fl.logFile.Close()
	}
	return nil
}

type WSClient struct {
	conn     *websocket.Conn
	clientID string
	lastPing time.Time
	mutex    sync.Mutex
}

func (wsc *WSClient) Send(message WSMessage) error {
	wsc.mutex.Lock()
	defer wsc.mutex.Unlock()

	wsc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return wsc.conn.WriteJSON(message)
}

func (wsc *WSClient) Close() error {
	wsc.mutex.Lock()
	defer wsc.mutex.Unlock()
	return wsc.conn.Close()
}

type APIKeyManager struct {
	mongoClient       *mongo.Client
	apiKeysCollection *mongo.Collection
	logsCollection    *mongo.Collection
	cache             *Cache
	config            *Config
	validator         *validator.Validate
	startTime         time.Time
	upgrader          websocket.Upgrader
	wsClients         sync.Map
	eventChan         chan WSMessage
	shutdownOnce      sync.Once
	ctx               context.Context
	cancel            context.CancelFunc
	mongoConnected    int32
	fileLogger        *FileLogger
}

func NewAPIKeyManager(config *Config) (*APIKeyManager, error) {
	v := validator.New()
	if err := v.Struct(config); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	fileLogger, err := NewFileLogger(config.LogDir, config.MaxLogSize, config.MaxLogFiles)
	if err != nil {
		log.Printf("Warning: Failed to initialize file logger: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	manager := &APIKeyManager{
		cache:     &Cache{},
		config:    config,
		validator: v,
		startTime: time.Now(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		eventChan:  make(chan WSMessage, 1000),
		ctx:        ctx,
		cancel:     cancel,
		fileLogger: fileLogger,
	}

	return manager, nil
}

func loadConfig(filePath string) (*Config, error) {
	config := &Config{
		ServerPort:        "3001",
		MongoURI:          "mongodb://localhost:27017",
		DatabaseName:      "apikeys",
		ApiKeysCollection: "keys",
		LogsCollection:    "logs",
		ReadTimeout:       30,
		WriteTimeout:      30,
		IdleTimeout:       120,
		JWTSecret:         generateSecureKey(64),
		AdminPassword:     "admin123",
		MaxRetries:        3,
		RetryDelay:        1000,
		LogDir:            "logs",
		MaxLogSize:        10 * 1024 * 1024,
		MaxLogFiles:       5,
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		log.Printf("Config file not found, using defaults")
		return config, nil
	}

	file, err := os.Open(filePath)
	if err != nil {
		return config, fmt.Errorf("error opening config file: %w", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(config); err != nil {
		return config, fmt.Errorf("error parsing config file: %w", err)
	}

	return config, nil
}

func generateSecureKey(length int) string {
	key, _ := generateRandomKey(length)
	return key
}

func (m *APIKeyManager) logToFile(level, message string, fields ...interface{}) {
	if m.fileLogger == nil {
		return
	}

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logLine := fmt.Sprintf("[%s] %s: %s", timestamp, level, message)

	if len(fields) > 0 {
		logLine += fmt.Sprintf(" %v", fields)
	}

	logLine += "\n"
	m.fileLogger.Write([]byte(logLine))
}

func (m *APIKeyManager) Info(message string, fields ...interface{}) {
	m.logToFile("INFO", message, fields...)
}

func (m *APIKeyManager) Error(message string, fields ...interface{}) {
	log.Printf("[ERROR] %s %v", message, fields)
	m.logToFile("ERROR", message, fields...)
}

func (m *APIKeyManager) Warn(message string, fields ...interface{}) {
	log.Printf("[WARN] %s %v", message, fields)
	m.logToFile("WARN", message, fields...)
}

func (m *APIKeyManager) Debug(message string, fields ...interface{}) {
	m.logToFile("DEBUG", message, fields...)
}

func (m *APIKeyManager) connectMongo() error {
	m.Info("Connecting to MongoDB", "uri", m.config.MongoURI)

	clientOptions := options.Client().
		ApplyURI(m.config.MongoURI).
		SetMaxPoolSize(20).
		SetMinPoolSize(5).
		SetRetryWrites(true).
		SetRetryReads(true).
		SetConnectTimeout(15 * time.Second).
		SetServerSelectionTimeout(15 * time.Second).
		SetSocketTimeout(30 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var err error
	m.mongoClient, err = mongo.Connect(ctx, clientOptions)
	if err != nil {
		m.setMongoStatus(false)
		return fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	ctxPing, cancelPing := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelPing()

	if err = m.mongoClient.Ping(ctxPing, readpref.Primary()); err != nil {
		m.setMongoStatus(false)
		return fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	m.apiKeysCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.ApiKeysCollection)
	m.logsCollection = m.mongoClient.Database(m.config.DatabaseName).Collection(m.config.LogsCollection)

	if err := m.createIndexes(); err != nil {
		m.Warn("Failed to create indexes", "error", err)
	}

	m.setMongoStatus(true)
	m.Info("Successfully connected to MongoDB")
	return nil
}

func (m *APIKeyManager) createIndexes() error {
	ctx, cancel := context.WithTimeout(m.ctx, 30*time.Second)
	defer cancel()

	keysIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "isActive", Value: 1}}},
		{Keys: bson.D{{Key: "expiration", Value: 1}}},
		{Keys: bson.D{{Key: "createdAt", Value: -1}}},
	}

	if _, err := m.apiKeysCollection.Indexes().CreateMany(ctx, keysIndexes); err != nil {
		return fmt.Errorf("failed to create keys indexes: %w", err)
	}

	logsIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "timestamp", Value: -1}}},
		{Keys: bson.D{{Key: "level", Value: 1}}},
		{Keys: bson.D{{Key: "component", Value: 1}}},
	}

	if _, err := m.logsCollection.Indexes().CreateMany(ctx, logsIndexes); err != nil {
		return fmt.Errorf("failed to create logs indexes: %w", err)
	}

	return nil
}

func (m *APIKeyManager) setMongoStatus(connected bool) {
	if connected {
		atomic.StoreInt32(&m.mongoConnected, 1)
	} else {
		atomic.StoreInt32(&m.mongoConnected, 0)
	}
}

func (m *APIKeyManager) isMongoConnected() bool {
	return atomic.LoadInt32(&m.mongoConnected) == 1
}

func (m *APIKeyManager) ensureMongoConnection() error {
	if !m.isMongoConnected() {
		return m.connectMongo()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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

	ctx, cancel := context.WithTimeout(m.ctx, 30*time.Second)
	defer cancel()

	cursor, err := m.apiKeysCollection.Find(ctx, bson.M{})
	if err != nil {
		return fmt.Errorf("failed to find API keys: %w", err)
	}
	defer cursor.Close(ctx)

	count := 0
	for cursor.Next(ctx) {
		var key APIKey
		if err := cursor.Decode(&key); err != nil {
			m.Warn("Failed to decode API key", "error", err)
			continue
		}
		m.cache.SetAPIKey(&key)
		count++
	}

	if err := cursor.Err(); err != nil {
		return fmt.Errorf("cursor error: %w", err)
	}

	m.Info("Loaded API keys to cache", "count", count)
	return nil
}

func generateRandomKey(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b), nil
}

func parseExpiration(expirationStr string) (time.Duration, error) {
	if len(expirationStr) < 2 {
		return 0, errors.New("invalid expiration format: too short")
	}

	expirationStr = strings.TrimSpace(strings.ToLower(expirationStr))

	re := regexp.MustCompile(`^(\d+)([mhdwy]|mo)$`)
	matches := re.FindStringSubmatch(expirationStr)

	if len(matches) != 3 {
		return 0, fmt.Errorf("invalid expiration format: '%s'. Expected format like '1d', '2w', '1mo', '1y'", expirationStr)
	}

	valueStr, unit := matches[1], matches[2]
	value, err := strconv.ParseInt(valueStr, 10, 64)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("invalid numeric value '%s' in expiration: must be a positive integer", valueStr)
	}

	var duration time.Duration
	var maxValue int64

	switch unit {
	case "m":
		duration = time.Duration(value) * time.Minute
		maxValue = 525600
	case "h":
		duration = time.Duration(value) * time.Hour
		maxValue = 8760
	case "d":
		duration = time.Duration(value) * 24 * time.Hour
		maxValue = 365
	case "w":
		duration = time.Duration(value) * 7 * 24 * time.Hour
		maxValue = 52
	case "mo":
		duration = time.Duration(value) * 30 * 24 * time.Hour
		maxValue = 12
	case "y":
		duration = time.Duration(value) * 365 * 24 * time.Hour
		maxValue = 5
	default:
		return 0, fmt.Errorf("invalid expiration unit '%s': supported units are m, h, d, w, mo, y", unit)
	}

	if value > maxValue {
		return 0, fmt.Errorf("expiration value %d%s exceeds maximum allowed (%d%s)", value, unit, maxValue, unit)
	}

	if duration < time.Minute {
		return 0, errors.New("expiration duration must be at least 1 minute")
	}

	return duration, nil
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
		LastUsed:      apiKey.LastUsed,
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
	return fmt.Errorf("operation failed after %d retries: %w", m.config.MaxRetries, lastErr)
}

func (m *APIKeyManager) SaveAPIKey(apiKey *APIKey) error {
	if err := m.ensureMongoConnection(); err != nil {
		return err
	}

	if err := m.validator.Struct(apiKey); err != nil {
		return fmt.Errorf("invalid API key data: %w", err)
	}

	ctx, cancel := context.WithTimeout(m.ctx, 15*time.Second)
	defer cancel()

	apiKey.UpdatedAt = time.Now().UTC()

	return m.withRetry(func() error {
		_, err := m.apiKeysCollection.ReplaceOne(
			ctx,
			bson.M{"_id": apiKey.ID},
			apiKey,
			options.Replace().SetUpsert(true),
		)
		return err
	})
}

func (m *APIKeyManager) generateAPIKey(req CreateKeyRequest) (*APIKey, error) {
	if err := m.validator.Struct(req); err != nil {
		m.Warn("Invalid create key request", "error", err, "request", fmt.Sprintf("%+v", req))
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return nil, errors.New("API key name cannot be empty")
	}

	expirationDuration, err := parseExpiration(req.Expiration)
	if err != nil {
		m.Warn("Invalid expiration in request", "expiration", req.Expiration, "error", err)
		return nil, fmt.Errorf("invalid expiration: %w", err)
	}

	m.Debug("Parsed expiration", "input", req.Expiration, "duration", expirationDuration)

	var keyID string
	if req.CustomKey != "" {
		if len(req.CustomKey) < 16 || len(req.CustomKey) > 64 {
			return nil, errors.New("custom API key must be between 16 and 64 characters")
		}

		if !isAlphaNumeric(req.CustomKey) {
			return nil, errors.New("custom API key must contain only alphanumeric characters")
		}

		if _, exists := m.cache.GetAPIKey(req.CustomKey); exists {
			return nil, errors.New("custom API key already exists")
		}
		keyID = req.CustomKey
	} else {
		for i := 0; i < 10; i++ {
			keyID, err = generateRandomKey(32)
			if err != nil {
				m.Error("Failed to generate random key", "attempt", i, "error", err)
				return nil, fmt.Errorf("failed to generate key: %w", err)
			}
			if _, exists := m.cache.GetAPIKey(keyID); !exists {
				break
			}
			keyID = ""
		}
		if keyID == "" {
			return nil, errors.New("failed to generate a unique API key after 10 attempts")
		}
	}

	now := time.Now().UTC()
	expirationTime := now.Add(expirationDuration)

	if !expirationTime.After(now) {
		return nil, errors.New("calculated expiration time is not in the future")
	}

	apiKey := &APIKey{
		ID:            keyID,
		Name:          req.Name,
		Expiration:    expirationTime,
		RPM:           req.RPM,
		ThreadsLimit:  req.ThreadsLimit,
		TotalRequests: req.TotalRequests,
		UsageCount:    0,
		CreatedAt:     now,
		UpdatedAt:     now,
		IsActive:      true,
		Metadata:      make(map[string]interface{}),
	}

	if err := m.validator.Struct(apiKey); err != nil {
		m.Error("Generated API key failed validation", "error", err, "key", apiKey)
		return nil, fmt.Errorf("generated API key is invalid: %w", err)
	}

	if err = m.SaveAPIKey(apiKey); err != nil {
		m.Error("Failed to save API key to database", "keyId", maskAPIKey(keyID), "error", err)
		return nil, fmt.Errorf("failed to save API key: %w", err)
	}

	m.cache.SetAPIKey(apiKey)

	m.logMessage("INFO", "API Key generated successfully", map[string]interface{}{
		"component":  "apikey",
		"keyId":      maskAPIKey(apiKey.ID),
		"name":       apiKey.Name,
		"expiration": apiKey.Expiration.Format(time.RFC3339),
		"duration":   expirationDuration.String(),
		"userId":     "admin",
	})

	m.broadcastEvent(WSMessage{
		Type:      "key_created",
		Data:      m.toAPIKeyResponse(apiKey),
		Timestamp: time.Now().UTC(),
		ID:        generateRequestID(),
	})

	return apiKey, nil
}

func generateRequestID() string {
	id, _ := generateRandomKey(8)
	return id
}

func (m *APIKeyManager) validationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "POST" || c.Request.Method == "PUT" {
			contentType := c.GetHeader("Content-Type")
			if !strings.Contains(contentType, "application/json") {
				m.respondWithError(c, http.StatusBadRequest, "Content-Type must be application/json", "INVALID_CONTENT_TYPE", nil)
				return
			}

			if c.Request.ContentLength > 1024*1024 {
				m.respondWithError(c, http.StatusRequestEntityTooLarge, "Request body too large", "BODY_TOO_LARGE", nil)
				return
			}
		}
		c.Next()
	}
}

func (m *APIKeyManager) corsMiddleware() gin.HandlerFunc {
	config := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}
	return cors.New(config)
}

func (m *APIKeyManager) requestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := generateRequestID()
		c.Set("requestID", requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

func (m *APIKeyManager) loggingMiddleware() gin.HandlerFunc {
	return gin.LoggerWithConfig(gin.LoggerConfig{
		Output: io.Discard,
		Formatter: func(param gin.LogFormatterParams) string {
			if param.StatusCode >= 400 {
				log.Printf("[%d] %s %s %v", param.StatusCode, param.Method, param.Path, param.Latency)
			}

			m.Info("Request",
				"method", param.Method,
				"path", param.Path,
				"status", param.StatusCode,
				"latency", param.Latency,
				"ip", param.ClientIP,
			)
			return ""
		},
	})
}

func (m *APIKeyManager) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		token := c.GetHeader("Authorization")
		if token == "" {
			m.respondWithError(c, http.StatusUnauthorized, "Authorization header required", "AUTH_MISSING", nil)
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
			m.respondWithError(c, http.StatusUnauthorized, "Invalid or expired token", "AUTH_INVALID", err)
			return
		}

		c.Set("claims", claims)
		c.Set("userID", claims["sub"])
		c.Next()
	}
}

func (m *APIKeyManager) respondWithError(c *gin.Context, statusCode int, message, code string, err error) {
	requestID, _ := c.Get("requestID")

	response := ErrorResponse{
		Error:     message,
		Code:      code,
		Timestamp: time.Now().UTC(),
		RequestID: fmt.Sprintf("%v", requestID),
	}

	if err != nil {
		response.Details = err.Error()
		m.Error("Request error", "error", err, "requestId", requestID, "path", c.Request.URL.Path)
	}

	c.JSON(statusCode, response)
}

func (m *APIKeyManager) respondWithSuccess(c *gin.Context, data interface{}, message string) {
	response := ApiResponse{
		Data:      data,
		Message:   message,
		Success:   true,
		Timestamp: time.Now().UTC(),
	}
	c.JSON(http.StatusOK, response)
}

func (m *APIKeyManager) healthHandler(c *gin.Context) {
	uptime := time.Since(m.startTime).Seconds()

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	allKeys := m.cache.ListKeys()
	now := time.Now().UTC()
	activeKeys := 0
	expiredKeys := 0

	for _, key := range allKeys {
		if !key.IsActive {
			continue
		}
		if key.Expiration.After(now) {
			activeKeys++
		} else {
			expiredKeys++
		}
	}

	stats := map[string]interface{}{
		"uptime":       uptime,
		"totalKeys":    len(allKeys),
		"activeKeys":   activeKeys,
		"expiredKeys":  expiredKeys,
		"memoryUsage":  memStats.Alloc,
		"mongoStatus":  m.isMongoConnected(),
		"cacheHitRate": m.cache.GetHitRate(),
		"cacheSize":    m.cache.Size(),
		"goRoutines":   runtime.NumGoroutine(),
		"serverTime":   time.Now().UTC().Format(time.RFC3339),
		"timezone":     "UTC",
	}

	status := "healthy"
	if !m.isMongoConnected() {
		status = "degraded"
	}

	response := HealthResponse{
		Status:    status,
		Stats:     stats,
		Timestamp: time.Now().UTC(),
	}

	c.JSON(http.StatusOK, response)
}

func (m *APIKeyManager) loginHandler(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		m.respondWithError(c, http.StatusBadRequest, "Invalid request format", "INVALID_REQUEST", err)
		return
	}

	if err := m.validator.Struct(req); err != nil {
		m.respondWithError(c, http.StatusBadRequest, "Validation failed", "VALIDATION_ERROR", err)
		return
	}

	m.Info("Login attempt", "ip", c.ClientIP())

	if req.Password != m.config.AdminPassword {
		m.Warn("Failed login attempt", "ip", c.ClientIP())
		m.respondWithError(c, http.StatusUnauthorized, "Invalid password", "AUTH_FAILED", nil)
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"exp": expiresAt.Unix(),
		"iat": time.Now().Unix(),
		"sub": "admin",
		"jti": generateRequestID(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(m.config.JWTSecret))
	if err != nil {
		m.Error("Failed to generate token", "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to generate authentication token", "TOKEN_ERROR", err)
		return
	}

	m.Info("Successful login", "ip", c.ClientIP())

	m.logMessage("INFO", "User login", map[string]interface{}{
		"component": "auth",
		"userId":    "admin",
		"ip":        c.ClientIP(),
	})

	c.JSON(http.StatusOK, TokenResponse{
		Token:     tokenString,
		ExpiresAt: expiresAt.Unix(),
	})
}

func (m *APIKeyManager) createAPIKeyHandler(c *gin.Context) {
	var req CreateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		m.respondWithError(c, http.StatusBadRequest, "Invalid request data", "INVALID_REQUEST", err)
		return
	}

	apiKey, err := m.generateAPIKey(req)
	if err != nil {
		m.Error("Failed to create API key", "error", err, "ip", c.ClientIP())
		m.respondWithError(c, http.StatusBadRequest, err.Error(), "KEY_CREATION_FAILED", err)
		return
	}

	m.Info("API key created successfully", "keyId", maskAPIKey(apiKey.ID), "ip", c.ClientIP())
	m.respondWithSuccess(c, m.toAPIKeyResponse(apiKey), "API key created successfully")
}

func (m *APIKeyManager) listAPIKeysHandler(c *gin.Context) {
	m.Debug("API Keys request", "ip", c.ClientIP())

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	search := c.Query("search")
	filter := c.Query("filter")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}

	keys := m.cache.ListKeys()
	var filteredKeys []APIKey

	for _, key := range keys {
		include := true

		if search != "" {
			searchLower := strings.ToLower(search)
			include = strings.Contains(strings.ToLower(key.Name), searchLower) ||
				strings.Contains(strings.ToLower(key.ID), searchLower)
		}

		if include && filter != "" {
			now := time.Now().UTC()
			switch filter {
			case "active":
				include = key.IsActive && key.Expiration.After(now)
			case "expired":
				include = key.Expiration.Before(now) || key.Expiration.Equal(now)
			case "inactive":
				include = !key.IsActive
			}
		}

		if include {
			filteredKeys = append(filteredKeys, key)
		}
	}

	total := len(filteredKeys)
	start := (page - 1) * limit
	end := start + limit

	var response []APIKeyResponse
	if start < total {
		if end > total {
			end = total
		}
		for _, key := range filteredKeys[start:end] {
			response = append(response, m.toAPIKeyResponse(&key))
		}
	}

	if response == nil {
		response = []APIKeyResponse{}
	}

	pagination := &PaginationInfo{
		Page:       page,
		Limit:      limit,
		Total:      int64(total),
		TotalPages: (total + limit - 1) / limit,
	}

	c.JSON(http.StatusOK, ApiResponse{
		Data:       response,
		Pagination: pagination,
		Success:    true,
		Timestamp:  time.Now().UTC(),
	})
}

func (m *APIKeyManager) getAPIKeyHandler(c *gin.Context) {
	keyID := strings.TrimSpace(c.Param("id"))
	if keyID == "" {
		m.respondWithError(c, http.StatusBadRequest, "Key ID is required", "MISSING_KEY_ID", nil)
		return
	}

	apiKey, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		m.respondWithError(c, http.StatusNotFound, "API key not found", "KEY_NOT_FOUND", nil)
		return
	}

	m.respondWithSuccess(c, m.toAPIKeyResponse(apiKey), "")
}

func (m *APIKeyManager) updateAPIKeyHandler(c *gin.Context) {
	keyID := strings.TrimSpace(c.Param("id"))
	if keyID == "" {
		m.respondWithError(c, http.StatusBadRequest, "Key ID is required", "MISSING_KEY_ID", nil)
		return
	}

	var req UpdateKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		m.respondWithError(c, http.StatusBadRequest, "Invalid request data", "INVALID_REQUEST", err)
		return
	}

	if err := m.validator.Struct(req); err != nil {
		m.respondWithError(c, http.StatusBadRequest, "Validation failed", "VALIDATION_ERROR", err)
		return
	}

	apiKey, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		m.respondWithError(c, http.StatusNotFound, "API key not found", "KEY_NOT_FOUND", nil)
		return
	}

	changes := []string{}
	updated := false

	if req.Name != nil && strings.TrimSpace(*req.Name) != apiKey.Name {
		if strings.TrimSpace(*req.Name) == "" {
			m.respondWithError(c, http.StatusBadRequest, "API key name cannot be empty", "INVALID_NAME", nil)
			return
		}
		apiKey.Name = strings.TrimSpace(*req.Name)
		changes = append(changes, "name")
		updated = true
	}

	if req.RPM != nil && *req.RPM != apiKey.RPM {
		apiKey.RPM = *req.RPM
		changes = append(changes, "rpm")
		updated = true
	}

	if req.ThreadsLimit != nil && *req.ThreadsLimit != apiKey.ThreadsLimit {
		apiKey.ThreadsLimit = *req.ThreadsLimit
		changes = append(changes, "threadsLimit")
		updated = true
	}

	if req.TotalRequests != nil && *req.TotalRequests != apiKey.TotalRequests {
		apiKey.TotalRequests = *req.TotalRequests
		changes = append(changes, "totalRequests")
		updated = true
	}

	if req.IsActive != nil && *req.IsActive != apiKey.IsActive {
		apiKey.IsActive = *req.IsActive
		changes = append(changes, "isActive")
		updated = true
	}

	if req.Expiration != nil {
		expirationDuration, err := parseExpiration(*req.Expiration)
		if err != nil {
			m.Warn("Invalid expiration in update request", "keyId", keyID, "expiration", *req.Expiration, "error", err)
			m.respondWithError(c, http.StatusBadRequest, fmt.Sprintf("Invalid expiration format: %v", err), "INVALID_EXPIRATION", err)
			return
		}

		newExpiration := time.Now().UTC().Add(expirationDuration)

		if !newExpiration.After(time.Now().UTC()) {
			m.respondWithError(c, http.StatusBadRequest, "New expiration must be in the future", "INVALID_EXPIRATION_TIME", nil)
			return
		}

		if newExpiration.Sub(apiKey.Expiration).Abs() > time.Second {
			apiKey.Expiration = newExpiration
			changes = append(changes, "expiration")
			updated = true
		}
	}

	if !updated {
		m.respondWithSuccess(c, m.toAPIKeyResponse(apiKey), "No changes detected")
		return
	}

	apiKey.UpdatedAt = time.Now().UTC()

	if err := m.validator.Struct(apiKey); err != nil {
		m.Error("Updated API key failed validation", "keyId", keyID, "error", err)
		m.respondWithError(c, http.StatusBadRequest, "Updated key data is invalid", "VALIDATION_ERROR", err)
		return
	}

	if err := m.SaveAPIKey(apiKey); err != nil {
		m.Error("Failed to update API key in database", "keyId", keyID, "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to update API key", "UPDATE_FAILED", err)
		return
	}

	m.cache.SetAPIKey(apiKey)

	m.logMessage("INFO", "API Key updated", map[string]interface{}{
		"component": "apikey",
		"keyId":     maskAPIKey(apiKey.ID),
		"name":      apiKey.Name,
		"changes":   changes,
		"userId":    c.GetString("userID"),
	})

	m.broadcastEvent(WSMessage{
		Type:      "key_updated",
		Data:      m.toAPIKeyResponse(apiKey),
		Timestamp: time.Now().UTC(),
		ID:        generateRequestID(),
	})

	m.respondWithSuccess(c, m.toAPIKeyResponse(apiKey), fmt.Sprintf("API key updated successfully (%s)", strings.Join(changes, ", ")))
}

func (m *APIKeyManager) deleteAPIKeyHandler(c *gin.Context) {
	keyID := strings.TrimSpace(c.Param("id"))
	if keyID == "" {
		m.respondWithError(c, http.StatusBadRequest, "Key ID is required", "MISSING_KEY_ID", nil)
		return
	}

	_, exists := m.cache.GetAPIKey(keyID)
	if !exists {
		m.respondWithError(c, http.StatusNotFound, "API key not found", "KEY_NOT_FOUND", nil)
		return
	}

	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(m.ctx, 15*time.Second)
		defer cancel()
		_, err := m.apiKeysCollection.DeleteOne(ctx, bson.M{"_id": keyID})
		return err
	})

	if err != nil {
		m.Error("Failed to delete API key", "keyId", keyID, "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to delete API key", "DELETE_FAILED", err)
		return
	}

	m.cache.DeleteAPIKey(keyID)

	m.logMessage("INFO", "API Key deleted", map[string]interface{}{
		"component": "apikey",
		"keyId":     maskAPIKey(keyID),
		"userId":    c.GetString("userID"),
	})

	m.broadcastEvent(WSMessage{
		Type:      "key_deleted",
		Data:      gin.H{"id": keyID},
		Timestamp: time.Now().UTC(),
		ID:        generateRequestID(),
	})

	c.JSON(http.StatusOK, gin.H{
		"message":   "API key deleted successfully",
		"success":   true,
		"timestamp": time.Now().UTC(),
	})
}

func (m *APIKeyManager) cleanExpiredKeysHandler(c *gin.Context) {
	now := time.Now().UTC()
	var deletedCount int64

	err := m.withRetry(func() error {
		ctx, cancel := context.WithTimeout(m.ctx, 60*time.Second)
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
		m.Error("Failed to clean expired keys", "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to clean expired keys", "CLEANUP_FAILED", err)
		return
	}

	m.logMessage("INFO", "Cleaned expired API keys", map[string]interface{}{
		"component": "cleanup",
		"count":     deletedCount,
		"userId":    c.GetString("userID"),
	})

	c.JSON(http.StatusOK, gin.H{
		"message":   fmt.Sprintf("Successfully cleaned %d expired API keys", deletedCount),
		"count":     deletedCount,
		"success":   true,
		"timestamp": time.Now().UTC(),
	})
}

func (m *APIKeyManager) getLogsHandler(c *gin.Context) {
	m.Debug("Logs request", "ip", c.ClientIP())

	if !m.isMongoConnected() {
		m.respondWithError(c, http.StatusServiceUnavailable, "Database connection unavailable", "DB_UNAVAILABLE", nil)
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

	ctx, cancel := context.WithTimeout(m.ctx, 15*time.Second)
	defer cancel()

	totalCount, err := m.logsCollection.CountDocuments(ctx, filter)
	if err != nil {
		m.Error("Error counting logs", "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to count logs", "COUNT_FAILED", err)
		return
	}

	totalPages := int((totalCount + int64(limit) - 1) / int64(limit))

	opts := options.Find().
		SetSort(bson.D{{Key: "timestamp", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	cursor, err := m.logsCollection.Find(ctx, filter, opts)
	if err != nil {
		m.Error("Error finding logs", "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to retrieve logs", "RETRIEVAL_FAILED", err)
		return
	}
	defer cursor.Close(ctx)

	var logs []LogEntry
	if err := cursor.All(ctx, &logs); err != nil {
		m.Error("Error decoding logs", "error", err)
		m.respondWithError(c, http.StatusInternalServerError, "Failed to decode logs", "DECODE_FAILED", err)
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
		Success:    true,
		Timestamp:  time.Now().UTC(),
	})
}

func (m *APIKeyManager) wsHandler(c *gin.Context) {
	m.Info("WebSocket connection attempt", "ip", c.ClientIP())

	token := c.Query("token")
	if token == "" {
		m.Warn("Missing token in WebSocket query", "ip", c.ClientIP())
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
		m.Warn("Invalid WebSocket token", "ip", c.ClientIP(), "error", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
		return
	}

	conn, err := m.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		m.Error("WebSocket upgrade failed", "ip", c.ClientIP(), "error", err)
		return
	}

	clientID := generateRequestID()
	wsClient := &WSClient{
		conn:     conn,
		clientID: clientID,
		lastPing: time.Now(),
	}

	m.wsClients.Store(clientID, wsClient)
	m.Info("WebSocket client connected", "clientId", clientID, "ip", c.ClientIP())

	go m.handleWebSocketClient(clientID, wsClient)
}

func (m *APIKeyManager) handleWebSocketClient(clientID string, wsClient *WSClient) {
	defer func() {
		m.wsClients.Delete(clientID)
		wsClient.Close()
		m.Info("WebSocket client disconnected", "clientId", clientID)
	}()

	wsClient.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	wsClient.conn.SetPongHandler(func(string) error {
		wsClient.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		wsClient.lastPing = time.Now()
		return nil
	})

	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-pingTicker.C:
			if err := wsClient.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				m.Warn("Failed to send ping", "clientId", clientID, "error", err)
				return
			}
		default:
			_, message, err := wsClient.conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					m.Warn("WebSocket unexpected close", "clientId", clientID, "error", err)
				}
				return
			}

			var wsMsg map[string]interface{}
			if err := json.Unmarshal(message, &wsMsg); err == nil {
				if msgType, ok := wsMsg["type"].(string); ok && msgType == "ping" {
					response := map[string]interface{}{
						"type":      "pong",
						"timestamp": time.Now().UTC(),
					}
					if data, err := json.Marshal(response); err == nil {
						wsClient.conn.WriteMessage(websocket.TextMessage, data)
					}
				}
			}
		}
	}
}

func (m *APIKeyManager) broadcastEvent(event WSMessage) {
	select {
	case m.eventChan <- event:
	default:
		m.Warn("Event channel full, dropping event", "type", event.Type)
	}
}

func (m *APIKeyManager) eventBroadcaster() {
	go func() {
		m.Info("Event broadcaster started")
		for {
			select {
			case event := <-m.eventChan:
				clientCount := 0
				toDelete := make([]string, 0)

				m.wsClients.Range(func(key, value interface{}) bool {
					if wsClient, ok := value.(*WSClient); ok {
						if err := wsClient.Send(event); err != nil {
							m.Warn("Failed to send event to client", "clientId", key, "error", err)
							toDelete = append(toDelete, key.(string))
						} else {
							clientCount++
						}
					}
					return true
				})

				for _, clientID := range toDelete {
					if value, ok := m.wsClients.LoadAndDelete(clientID); ok {
						if wsClient, ok := value.(*WSClient); ok {
							wsClient.Close()
						}
					}
				}

				if clientCount > 0 {
					m.Debug("Broadcasted event", "type", event.Type, "clients", clientCount)
				}
			case <-m.ctx.Done():
				m.Info("Event broadcaster stopping")
				return
			}
		}
	}()
}

func (m *APIKeyManager) logMessage(level, message string, metadata map[string]interface{}) {
	m.Info(fmt.Sprintf("[%s] %s", level, message))

	if !m.isMongoConnected() {
		return
	}

	component := "system"
	if comp, ok := metadata["component"]; ok {
		component = fmt.Sprintf("%v", comp)
		delete(metadata, "component")
	}

	logEntry := LogEntry{
		Level:     level,
		Message:   message,
		Component: component,
		Timestamp: time.Now().UTC(),
		Metadata:  metadata,
	}

	if userID, ok := metadata["userId"]; ok {
		logEntry.UserID = fmt.Sprintf("%v", userID)
		delete(metadata, "userId")
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if _, err := m.logsCollection.InsertOne(ctx, logEntry); err != nil {
			m.Error("Failed to insert log entry", "error", err)
			return
		}

		m.broadcastEvent(WSMessage{
			Type:      "log_entry",
			Data:      logEntry,
			Timestamp: time.Now().UTC(),
			ID:        generateRequestID(),
		})
	}()
}

func (m *APIKeyManager) staticFileHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestPath := c.Request.URL.Path

		if strings.HasPrefix(requestPath, "/server/") {
			c.Next()
			return
		}

		filePath := path.Join("frontend/dist", requestPath)

		file, err := staticFiles.Open(filePath)
		if err != nil {
			c.Next()
			return
		}
		defer file.Close()

		stat, err := file.Stat()
		if err != nil {
			c.Next()
			return
		}

		if stat.IsDir() {
			c.Next()
			return
		}

		ext := filepath.Ext(requestPath)
		contentType := mime.TypeByExtension(ext)
		if contentType == "" {
			switch ext {
			case ".js", ".mjs":
				contentType = "application/javascript"
			case ".css":
				contentType = "text/css"
			case ".html":
				contentType = "text/html"
			case ".json":
				contentType = "application/json"
			case ".png":
				contentType = "image/png"
			case ".jpg", ".jpeg":
				contentType = "image/jpeg"
			case ".gif":
				contentType = "image/gif"
			case ".svg":
				contentType = "image/svg+xml"
			case ".ico":
				contentType = "image/x-icon"
			case ".woff":
				contentType = "font/woff"
			case ".woff2":
				contentType = "font/woff2"
			case ".ttf":
				contentType = "font/ttf"
			case ".eot":
				contentType = "application/vnd.ms-fontobject"
			default:
				contentType = "application/octet-stream"
			}
		}

		c.Header("Content-Type", contentType)
		c.Header("Cache-Control", "public, max-age=31536000")

		data, err := fs.ReadFile(staticFiles, filePath)
		if err != nil {
			c.Next()
			return
		}

		c.Data(http.StatusOK, contentType, data)
		c.Abort()
	}
}

func (m *APIKeyManager) shutdown() {
	m.shutdownOnce.Do(func() {
		m.Info("Starting graceful shutdown...")

		m.cancel()

		m.wsClients.Range(func(key, value interface{}) bool {
			if wsClient, ok := value.(*WSClient); ok {
				wsClient.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseGoingAway, "Server shutting down"))
				wsClient.Close()
			}
			m.wsClients.Delete(key)
			return true
		})

		close(m.eventChan)

		if m.mongoClient != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if err := m.mongoClient.Disconnect(ctx); err != nil {
				m.Error("Error disconnecting from MongoDB", "error", err)
			}
		}

		if m.fileLogger != nil {
			m.fileLogger.Close()
		}

		m.Info("Shutdown complete")
	})
}

func main() {
	log.Printf("Starting API Key Manager Server v2.0...")

	runtime.GOMAXPROCS(runtime.NumCPU())

	if gin.Mode() != gin.TestMode {
		gin.SetMode(gin.ReleaseMode)
	}

	config, err := loadConfig("server.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	manager, err := NewAPIKeyManager(config)
	if err != nil {
		log.Fatalf("Error creating API manager: %v", err)
	}

	log.Printf("Configuration loaded: Port=%s, DB=%s", config.ServerPort, config.DatabaseName)

	if err := manager.connectMongo(); err != nil {
		log.Printf("MongoDB connection failed: %v", err)
		log.Printf("Server will start but database features will be limited")
	}

	if err := manager.loadAPIKeysToCache(); err != nil {
		log.Printf("Failed to load API keys to cache: %v", err)
	}

	manager.eventBroadcaster()

	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
		v.RegisterValidation("alphanum", func(fl validator.FieldLevel) bool {
			return isAlphaNumeric(fl.Field().String())
		})
	}

	router := gin.New()
	router.Use(manager.loggingMiddleware())
	router.Use(gin.Recovery())
	router.Use(manager.requestIDMiddleware())
	router.Use(manager.corsMiddleware())
	router.Use(manager.validationMiddleware())

	serverGroup := router.Group("/server")
	{
		serverGroup.POST("/api/v1/auth/login", manager.loginHandler)
		serverGroup.GET("/api/v1/health", manager.healthHandler)
		serverGroup.GET("/api/v1/ws", manager.wsHandler)

		api := serverGroup.Group("/api/v1")
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
	}

	router.Use(manager.staticFileHandler())

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/server/") {
			manager.respondWithError(c, http.StatusNotFound, "API endpoint not found", "ENDPOINT_NOT_FOUND", nil)
			return
		}

		indexHTML, err := staticFiles.ReadFile("frontend/dist/index.html")
		if err != nil {
			c.String(http.StatusNotFound, "404 page not found")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
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

func isAlphaNumeric(s string) bool {
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}
