package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Arceliar/phony"
	"github.com/gorilla/websocket"
	"github.com/ulule/limiter/v3"
	"github.com/ulule/limiter/v3/drivers/store/memory"
)

const allowedOrigin = "https://d-led.github.io"
const allowedRoom = "domo-actors-counter"
const defaultSecret = "wss-changeme" // Change this in production via env var

// Version is set via linker flags during build: -ldflags "-X main.version=..."
var version = "dev" // Default value if not set during build

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		referer := r.Header.Get("Referer")

		// Allow localhost for local development
		if origin != "" && (origin == "http://localhost:8000" || origin == "http://127.0.0.1:8000") {
			return true
		}

		// Check Origin header
		if origin != "" && origin != allowedOrigin {
			log.Printf("Rejected connection from origin: %s", origin)
			return false
		}

		// Check Referer header (fallback)
		if referer != "" {
			if referer != allowedOrigin+"/domo-tryout/" && referer != allowedOrigin+"/domo-tryout" {
				// Allow localhost for local development
				if !(referer == "http://localhost:8000/" || referer == "http://127.0.0.1:8000/") {
					log.Printf("Rejected connection from referer: %s", referer)
					return false
				}
			}
		}

		return true
	},
}

// Connection represents a WebSocket connection actor
type Connection interface {
	SendMessage(message []byte)
	UpdateActivity() // Tell server about activity
	Close()
	Start()
}

// Server manages rooms and client connections
type Server interface {
	CheckCapacity(callback func(bool))                                               // Tell server to check if it can accept a client, callback from main only
	TryAddClient(room string, clientIP string, conn Connection, callback func(bool)) // Tell server to try adding, callback from main only
	RemoveClient(room string, conn Connection)
	Broadcast(room string, message []byte, sender Connection)
	CleanupInactiveClients(timeout time.Duration)
}

// ServerActor manages rooms and client connections
type ServerActor struct {
	phony.Inbox
	rooms        map[string]map[Connection]bool
	totalClients int
	maxClients   int
}

// ConnectionActor handles a single WebSocket connection
type ConnectionActor struct {
	phony.Inbox
	conn           *websocket.Conn
	room           string
	server         Server
	clientIP       string
	messageTimes   []time.Time // Sliding window for rate limiting
	maxRate        int         // Messages per second
	windowDuration time.Duration
	lastActivity   time.Time // Last message received time
	authenticated  bool      // Whether client has sent valid auth message
}

// Ensure ConnectionActor implements Connection interface
var _ Connection = (*ConnectionActor)(nil)

// Ensure ServerActor implements Server interface
var _ Server = (*ServerActor)(nil)

func NewServerActor() Server {
	s := &ServerActor{
		rooms:        make(map[string]map[Connection]bool),
		totalClients: 0,
		maxClients:   1000, // Maximum 1000 concurrent connections
	}
	log.Printf("ServerActor initialized with maxClients=%d", s.maxClients)
	return s
}

func (s *ServerActor) CheckCapacity(callback func(bool)) {
	s.Act(nil, func() {
		if s.maxClients == 0 {
			log.Printf("ERROR: maxClients is 0! Fixing to 1000")
			s.maxClients = 1000
		}
		canAccept := s.totalClients < s.maxClients
		if !canAccept {
			log.Printf("Rejected connection: max clients (%d) reached, current: %d", s.maxClients, s.totalClients)
		}
		callback(canAccept)
	})
}

func (s *ServerActor) TryAddClient(room string, clientIP string, conn Connection, callback func(bool)) {
	s.Act(nil, func() {
		if s.maxClients == 0 {
			log.Printf("ERROR: maxClients is 0! Fixing to 1000")
			s.maxClients = 1000
		}

		if s.totalClients >= s.maxClients {
			log.Printf("Rejected connection: max clients (%d) reached, current: %d", s.maxClients, s.totalClients)
			callback(false)
			return
		}

		m, ok := s.rooms[room]
		if !ok {
			m = make(map[Connection]bool)
			s.rooms[room] = m
		}
		m[conn] = true
		s.totalClients++
		log.Printf("Peer joined: room=%s ip=%s peers=%d total=%d", room, clientIP, len(m), s.totalClients)
		callback(true)
	})
}

func (s *ServerActor) RemoveClient(room string, conn Connection) {
	s.Act(nil, func() {
		if m, ok := s.rooms[room]; ok {
			delete(m, conn)
			if len(m) == 0 {
				delete(s.rooms, room)
			}
			s.totalClients--
			log.Printf("Peer left: room=%s peers=%d total=%d", room, len(m), s.totalClients)
		}
	})
}

func (s *ServerActor) Broadcast(room string, message []byte, sender Connection) {
	s.Act(nil, func() {
		if m, ok := s.rooms[room]; ok {
			for client := range m {
				if client != sender {
					client.SendMessage(message)
				}
			}
		}
	})
}

func (s *ServerActor) CleanupInactiveClients(timeout time.Duration) {
	// Cleanup is handled by connections removing themselves when they timeout
	// This is a no-op now - connections manage their own lifecycle
	s.Act(nil, func() {
		// Connections will remove themselves via removeSelf() when connection breaks
		// No need to query connections - they tell us when they're done
	})
}

func NewConnectionActor(conn *websocket.Conn, room string, server Server, clientIP string) Connection {
	return &ConnectionActor{
		conn:           conn,
		room:           room,
		server:         server,
		clientIP:       clientIP,
		messageTimes:   make([]time.Time, 0, 100000),
		maxRate:        100000, // 100000 messages per second (Yjs can send many updates during sync - effectively disabled)
		windowDuration: time.Second,
		lastActivity:   time.Now(),
	}
}

func (c *ConnectionActor) UpdateActivity() {
	// Tell self to update activity - unidirectional message
	c.Act(nil, func() {
		c.lastActivity = time.Now()
	})
}

func (c *ConnectionActor) Close() {
	c.conn.Close()
}

func (c *ConnectionActor) SendMessage(message []byte) {
	c.Act(nil, func() {
		if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
			log.Printf("Error sending message: %v", err)
		}
	})
}

func (c *ConnectionActor) checkRateLimit() bool {
	now := time.Now()
	windowStart := now.Add(-c.windowDuration)

	// Remove old timestamps outside the window
	validTimes := c.messageTimes[:0]
	for _, t := range c.messageTimes {
		if t.After(windowStart) {
			validTimes = append(validTimes, t)
		}
	}
	c.messageTimes = validTimes

	// Check if we're over the rate limit
	if len(c.messageTimes) >= c.maxRate {
		return false
	}

	// Add current message timestamp
	c.messageTimes = append(c.messageTimes, now)
	return true
}

func (c *ConnectionActor) removeSelf() {
	// Actor removes itself from server when connection breaks
	c.server.RemoveClient(c.room, c)
}

func (c *ConnectionActor) Start() {
	// Client is already added by main via TryAddClient
	// Ensure we remove ourselves when connection breaks
	defer c.removeSelf()

	log.Printf("Client connected to room: %s", c.room)

	// Get expected secret
	secret := getEnv("WS_SECRET")
	if secret == "" {
		secret = defaultSecret
	}

	// Wait for auth message (first message must be auth)
	authTimeout := time.NewTimer(5 * time.Second)
	authReceived := make(chan bool, 1)

	go func() {
		c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			authReceived <- false
			return
		}

		// Check if first message is auth
		if messageType == websocket.TextMessage {
			var authMsg map[string]interface{}
			if err := json.Unmarshal(message, &authMsg); err == nil {
				if authMsg["type"] == "auth" && authMsg["secret"] == secret {
					c.authenticated = true
					authReceived <- true
					return
				}
			}
		}
		authReceived <- false
	}()

	select {
	case authenticated := <-authReceived:
		if !authenticated {
			log.Printf("Rejected connection: invalid or missing auth message")
			c.conn.Close()
			return
		}
		log.Printf("Client authenticated in room: %s", c.room)
	case <-authTimeout.C:
		log.Printf("Rejected connection: auth timeout")
		c.conn.Close()
		return
	}

	for {
		// Set read deadline to detect inactive connections (5 seconds)
		c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			// Connection broken - remove self (handled by defer)
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error for client %s: %v", c.clientIP, err)
			}
			break
		}

		// Update activity for any message type (including pings/pongs) - tell self
		c.UpdateActivity()

		if messageType == websocket.BinaryMessage {
			// Broadcast message (rate limiting disabled for now - Yjs handles its own flow control)
			c.server.Broadcast(c.room, message, c)
		} else if messageType == websocket.PingMessage {
			// Respond to ping to keep connection alive
			c.conn.WriteMessage(websocket.PongMessage, nil)
		}
		// Pong messages are handled automatically by gorilla/websocket
	}
}

var srv Server = NewServerActor()

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Exclude /version endpoint from WebSocket handling
	if r.URL.Path == "/version" {
		http.NotFound(w, r)
		return
	}

	// Basic rate limiting per IP to mitigate bots
	if reached, limit, remaining, reset := rateLimit(r); reached {
		w.Header().Set("X-RateLimit-Limit", limit)
		w.Header().Set("X-RateLimit-Remaining", remaining)
		w.Header().Set("X-RateLimit-Reset", reset)
		http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
		return
	}

	roomName := r.URL.Path[1:] // Remove leading /
	if roomName == "" {
		http.Error(w, "Bad request, sorry", http.StatusBadRequest)
		return
	}

	// Only allow the specific room
	if roomName != allowedRoom {
		log.Printf("Rejected connection to room: %s (only %s allowed)", roomName, allowedRoom)
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Note: Browser WebSocket API doesn't support custom headers
	// So we'll accept the connection and validate secret from first message
	// This is less secure than header-based auth, but necessary for browser compatibility

	// Check capacity BEFORE upgrading connection (can't write HTTP errors after upgrade)
	capacityChan := make(chan bool, 1)
	phony.Block(srv.(*ServerActor), func() {
		srv.CheckCapacity(func(success bool) {
			capacityChan <- success
		})
	})

	canAccept := <-capacityChan
	if !canAccept {
		http.Error(w, "Server at capacity", http.StatusServiceUnavailable)
		return
	}

	// Now upgrade the connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}
	// Don't defer close here - connection actor will manage its own lifecycle

	// Create connection actor and add it
	connActor := NewConnectionActor(conn, roomName, srv, clientIP(r))

	// Add the real connection (should succeed since we checked capacity)
	acceptChan := make(chan bool, 1)
	phony.Block(srv.(*ServerActor), func() {
		srv.TryAddClient(roomName, clientIP(r), connActor, func(success bool) {
			acceptChan <- success
		})
	})

	accepted := <-acceptChan
	if !accepted {
		log.Printf("WARNING: Failed to add client after upgrade - closing connection")
		conn.Close()
		return
	}

	// Start connection actor (runs in goroutine, will handle its own cleanup)
	// Connection actor will close the connection when done via defer in Start()
	go connActor.Start()
}

func main() {
	port := "9870"
	if p := getEnv("PORT"); p != "" {
		port = p
	}

	// Start periodic cleanup of inactive clients (3 second timeout, like UI peer timeout)
	// This sweeps for clients that haven't sent any messages (including pings) in the timeout period
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			srv.CleanupInactiveClients(3 * time.Second)
		}
	}()

	http.HandleFunc("/", handleWebSocket)
	http.HandleFunc("/version", handleVersion)

	log.Printf("Yjs WebSocket server starting on port %s (version: %s)", port, version)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func getEnv(key string) string {
	return os.Getenv(key)
}

// Simple in-memory rate limiter (60 req/min per client IP)
var rl = limiter.New(memory.NewStore(), limiter.Rate{
	Period: 60 * time.Second,
	Limit:  60,
})

func clientIP(r *http.Request) string {
	// Prefer X-Forwarded-For first IP if present (be careful if behind untrusted proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	// Fallback to RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func rateLimit(r *http.Request) (reached bool, limit, remaining, reset string) {
	ctx, err := rl.Get(r.Context(), clientIP(r))
	if err != nil {
		return false, "", "", ""
	}
	return ctx.Reached, strconv.FormatInt(ctx.Limit, 10), strconv.FormatInt(ctx.Remaining, 10), strconv.FormatInt(ctx.Reset, 10)
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(version))
}
