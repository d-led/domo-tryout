import { Actor, Protocol, stage } from 'domo-actors'
import { syncedStore, getYjsDoc, observeDeep } from '@syncedstore/core'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
// embed-begin
//...
import { Counter, SyncedCounter } from './Counter.js'

// Create synced store
type StoreType = {
  data: {
    count?: number
  }
}
const store = syncedStore<StoreType>({ data: {} })
const doc = getYjsDoc(store)

// Configure centralized WebSocket provider (overridable via ?ws=)
// Shared secret for authentication (injected during build from CI secrets)
const WS_SECRET = '__WS_SECRET__'

function resolveWsServer(): string {
  try {
    const params = new URLSearchParams(location.search)
    const ws = params.get('ws')
    if (ws && ws.startsWith('ws')) {
      return ws
    }
  } catch {
    // ignore
  }
  // No default - user must provide via ?ws= parameter
  return ''
}
const WS_SERVER = resolveWsServer()
// __WS_SERVER_URL__ will be replaced during build with production URL, or fallback to localhost
const INJECTED_WS_SERVER = '__WS_SERVER_URL__'
const defaultWsServer =
  INJECTED_WS_SERVER && INJECTED_WS_SERVER !== '__WS_SERVER_URL__'
    ? INJECTED_WS_SERVER
    : 'ws://localhost:9870'

// Custom WebSocket that sends secret in header via first message
// Browser WebSocket API doesn't support custom headers, so we send auth as first message
// Server will validate and close connection if invalid
class HeaderWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private protocols: string[]
  private _readyState: number = WebSocket.CONNECTING
  private eventHandlers: { [key: string]: ((event: any) => void)[] } = {}
  private authSent = false
  private messageQueue: (string | ArrayBuffer | Blob)[] = []

  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  // Expose readyState as a property (not just private field) so WebsocketProvider can access it
  get readyState(): number {
    // Return underlying WebSocket's readyState if available, otherwise use our tracked state
    return this.ws ? this.ws.readyState : this._readyState
  }

  constructor(url: string | URL, protocols: string[] = []) {
    this.url = typeof url === 'string' ? url : url.toString()
    this.protocols = Array.isArray(protocols) ? protocols : [protocols]
    this.ws = new WebSocket(this.url, this.protocols)
    this.setupNativeWebSocket()
  }

  private setupNativeWebSocket() {
    if (!this.ws) return

    // Intercept send to ensure auth is ALWAYS sent first, before any other messages
    const originalSend = this.ws.send.bind(this.ws)
    
    this.ws.send = (data: string | ArrayBuffer | Blob) => {
      if (!this.authSent) {
        // First send() call - send auth immediately, then queue this message
        this.authSent = true
        const authMsg = JSON.stringify({ type: 'auth', secret: WS_SECRET })
        originalSend(authMsg)
        // Queue the actual message to send after auth
        this.messageQueue.push(data)
      } else {
        // Auth already sent, send normally
        originalSend(data)
      }
    }

    this.ws.onopen = (event) => {
      this._readyState = WebSocket.OPEN
      // If no messages were sent yet (auth not sent), send auth now
      if (!this.authSent) {
        this.authSent = true
        const authMsg = JSON.stringify({ type: 'auth', secret: WS_SECRET })
        originalSend(authMsg)
      }
      // Send any queued messages (these were queued before auth was sent)
      this.messageQueue.forEach(msg => originalSend(msg))
      this.messageQueue = []
      this.emit('open', event)
      // Immediately update connection status when WebSocket opens (synchronously, no setTimeout)
      // This is a direct hook to ensure UI updates even if WebsocketProvider doesn't detect it
      isConnected = true
      const statusEl = document.getElementById('connection-status')
      if (statusEl) {
        // Update status directly - green socket icon
        statusEl.innerHTML = '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #28a745; vertical-align: middle; cursor: pointer;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z"/></svg>'
        statusEl.title = 'Connected - Click to reconnect'
      }
      // Set awareness immediately when connected - this makes us visible to other peers
      awareness.setLocalStateField('user', {
        clientID: doc.clientID,
        timestamp: Date.now()
      })
      // Update peer count after delays to catch awareness updates
      setTimeout(() => updatePeerCount(), 100)
      setTimeout(() => updatePeerCount(), 500)
    }

    this.ws.onmessage = (event) => {
      this.emit('message', event)
    }
    
    // Ensure the provider can access the WebSocket instance
    ;(this as any).ws = this.ws

    this.ws.onerror = (event) => {
      this.emit('error', event)
    }

    this.ws.onclose = (event) => {
      this._readyState = WebSocket.CLOSED
      this.emit('close', event)
      // Immediately update connection status when WebSocket closes (synchronously, no setTimeout)
      isConnected = false
      const statusEl = document.getElementById('connection-status')
      if (statusEl) {
        // Update status directly - red socket icon with X
        statusEl.innerHTML = '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #dc3545; vertical-align: middle; cursor: pointer;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z" opacity="0.5"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>'
        statusEl.title = 'Disconnected - Click to reconnect'
      }
      peerCount = 0
      const peerEl = document.getElementById('peer-count')
      if (peerEl) peerEl.textContent = '0'
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers[event] || []
    handlers.forEach(handler => handler(data))
  }

  addEventListener(event: string, handler: (event: any) => void) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = []
    }
    this.eventHandlers[event].push(handler)
  }

  removeEventListener(event: string, handler: (event: any) => void) {
    const handlers = this.eventHandlers[event]
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }

  send(data: string | ArrayBuffer | Blob) {
    if (this.ws && this._readyState === WebSocket.OPEN) {
      // The intercepted send method will ensure auth is sent first
      this.ws.send(data)
    } else {
      // Queue messages until connection is open
      this.messageQueue.push(data)
    }
  }

  close() {
    if (this.ws) {
      this._readyState = WebSocket.CLOSING
      this.ws.close()
    }
  }
}

// Use WebSocket provider with custom WebSocket that sends secret as first message
// Browser WebSocket API limitation: can't set custom headers, so we send auth as first message
const wsProvider = new WebsocketProvider(WS_SERVER || defaultWsServer, 'domo-actors-counter', doc, {
  WebSocketPolyfill: HeaderWebSocket as any,
  // Ensure the provider can access the underlying WebSocket for status detection
  params: {}
})
const awareness = wsProvider.awareness

// Track initial connection state
let isConnected = false

// Set awareness state immediately (will be synced when connected)
// This ensures we're visible to other peers
awareness.setLocalStateField('user', {
  clientID: doc.clientID,
  timestamp: Date.now()
})

// Set up IndexedDB persistence
const INDEXEDDB_NAME = 'domo-actors-counter'
const indexeddbProvider = new IndexeddbPersistence(INDEXEDDB_NAME, doc)

// Actor reference for transport callbacks
let syncedCounterActor: SyncedCounter | null = null

function sendToActor(value: number) {
  if (syncedCounterActor) {
    syncedCounterActor.updateFromRemote(value)
  }
}

// Initialize count after IndexedDB loads persisted state
indexeddbProvider.on('synced', () => {
  if (store.data.count === undefined) {
    doc.transact(() => {
      store.data.count = 0
    }, doc.clientID)
  } else {
    sendToActor(store.data.count || 0)
  }
})

// Track peer count
let peerCount = 0
let heartbeatTimer: number | null = null

function updateConnectionStatus(connected: boolean) {
  const el = document.getElementById('connection-status')
  if (el) {
    if (connected) {
      // Green socket icon for connected (larger size, clickable)
      el.innerHTML = '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #28a745; vertical-align: middle; cursor: pointer;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z"/></svg>'
      el.title = 'Connected - Click to reconnect'
    } else {
      // Red socket icon with X for disconnected (larger size, clickable)
      el.innerHTML = '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #dc3545; vertical-align: middle; cursor: pointer;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z" opacity="0.5"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>'
      el.title = 'Disconnected - Click to reconnect'
    }
  }
}

// Manual reconnection handler (y-websocket has built-in exponential backoff, but we can trigger it manually)
function triggerReconnection() {
  // Check if underlying WebSocket exists and is open
  const ws = (wsProvider as any).ws
  if (ws && (ws.readyState === WebSocket.OPEN || (ws.ws && ws.ws.readyState === WebSocket.OPEN))) {
    // Already connected, no need to reconnect
    return
  }
  
  // Disconnect and let y-websocket's built-in reconnection logic handle it
  // This will trigger the exponential backoff reconnection
  wsProvider.disconnect()
  // Reconnect immediately (y-websocket will handle backoff if it fails)
  wsProvider.connect()
}

// Add click handler to connection status icon
function setupConnectionStatusClickHandler() {
  const el = document.getElementById('connection-status')
  if (el) {
    el.addEventListener('click', triggerReconnection)
    el.style.cursor = 'pointer'
  }
}

// Keep awareness alive
wsProvider.on('status', ({ status }) => {
  if (status === 'connected') {
    isConnected = true
    updateConnectionStatus(true)
    // Ensure awareness is set when connected
    awareness.setLocalStateField('user', {
      clientID: doc.clientID,
      timestamp: Date.now()
    })
    
    // Keep awareness alive with heartbeat
    if (heartbeatTimer === null) {
      heartbeatTimer = window.setInterval(() => {
        if (isConnected) {
          awareness.setLocalStateField('user', {
            clientID: doc.clientID,
            timestamp: Date.now()
          })
        }
      }, 5000)
    }
    // Update peer count after delays to catch awareness updates
    setTimeout(() => updatePeerCount(), 100)
    setTimeout(() => updatePeerCount(), 500)
  } else if (status === 'disconnected') {
    isConnected = false
    updateConnectionStatus(false)
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    peerCount = 0
    const el = document.getElementById('peer-count')
    if (el) {
      el.textContent = '0'
    }
    // Also clear awareness states to ensure clean state
    awareness.setLocalState(null)
  }
})

// Fallback: Poll connection status directly from WebSocket readyState
// This ensures we detect connection even if WebsocketProvider doesn't emit status events
setInterval(() => {
  const ws = (wsProvider as any).ws
  if (ws) {
    // Check readyState - could be our HeaderWebSocket or the underlying native WebSocket
    const readyState = ws.readyState !== undefined ? ws.readyState : (ws.ws && ws.ws.readyState)
    
    if (readyState === WebSocket.OPEN) {
      if (!isConnected) {
        // Force connection status update
        console.log('Fallback: Detected connection via readyState polling')
        isConnected = true
        updateConnectionStatus(true)
        // Set awareness
        awareness.setLocalStateField('user', {
          clientID: doc.clientID,
          timestamp: Date.now()
        })
        // Start heartbeat if not already started
        if (heartbeatTimer === null) {
          heartbeatTimer = window.setInterval(() => {
            if (isConnected) {
              awareness.setLocalStateField('user', {
                clientID: doc.clientID,
                timestamp: Date.now()
              })
            }
          }, 5000)
        }
        setTimeout(() => updatePeerCount(), 100)
      }
    } else if (readyState === WebSocket.CLOSED || readyState === WebSocket.CLOSING) {
      if (isConnected) {
        // Force disconnection status update
        console.log('Fallback: Detected disconnection via readyState polling')
        isConnected = false
        updateConnectionStatus(false)
        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
        peerCount = 0
        const el = document.getElementById('peer-count')
        if (el) {
          el.textContent = '0'
        }
      }
    }
  }
}, 500) // Poll every 500ms

// Initialize connection status as disconnected
updateConnectionStatus(false)

// Set up click handler for manual reconnection
setupConnectionStatusClickHandler()

function updatePeerCount() {
  const el = document.getElementById('peer-count')
  if (!el) return

  if (!isConnected) {
    peerCount = 0
    el.textContent = '0'
    return
  }

  // Get all awareness states (includes self)
  const awarenessStates = awareness.getStates()
  const selfClientID = doc.clientID
  
  // Count peers excluding self
  let activePeerCount = 0
  awarenessStates.forEach((state, clientID) => {
    if (clientID !== selfClientID) {
      activePeerCount++
    }
  })

  // Always update the UI, even if count hasn't changed (in case of race conditions)
  peerCount = activePeerCount
  el.textContent = peerCount.toString()
}

awareness.on('update', ({ added, updated, removed }) => {
  if (!isConnected) return
  // Immediately update peer count when awareness changes
  updatePeerCount()
})

// Poll peer count to catch awareness updates
setInterval(() => {
  if (isConnected) {
    updatePeerCount()
  }
}, 250)

// Transport callbacks send messages to actor via interface (unidirectional messaging)
observeDeep(store, () => {
  if (!isConnected) {
    // Still send value to actor even when disconnected (for local state)
    const newValue = store.data.count || 0
    sendToActor(newValue)
    return
  }

  updatePeerCount()

  const newValue = store.data.count || 0
  sendToActor(newValue)
})

doc.on('update', (update: Uint8Array, origin: any) => {
  const isRemote = origin !== doc.clientID && origin !== null
  if (isRemote) {
    const newValue = store.data.count || 0
    sendToActor(newValue)
  }
})

class CounterActor extends Actor implements SyncedCounter {
  private lastKnownCount = 0

  constructor() {
    super()
  }

  initialize() {
    const initialValue = store.data.count || 0
    this.lastKnownCount = initialValue
    this.update()
  }

  updateFromRemote(value: number) {
    if (value !== this.lastKnownCount) {
      this.lastKnownCount = value
      this.update()
    }
  }

  increment() {
    const currentValue = store.data.count || 0
    const newValue = currentValue + 1
    
    doc.transact(() => {
      store.data.count = newValue
    }, doc.clientID)
    
    this.lastKnownCount = newValue
    this.update()
  }

  decrement() {
    const currentValue = store.data.count || 0
    const newValue = currentValue - 1
    
    doc.transact(() => {
      store.data.count = newValue
    }, doc.clientID)
    
    this.lastKnownCount = newValue
    this.update()
  }

  private update() {
    const el = document.getElementById('synced-count')
    if (el) el.textContent = (store.data.count || 0).toString()
  }
}

export function createSyncedCounter() {
  const appStage = (window as any).appStage || stage()
  
  const syncedCounter = (appStage.actorFor as any)({
    instantiator: () => ({
      instantiate: () => {
        const actor = new CounterActor()
        setTimeout(() => actor.initialize(), 0)
        return actor
      }
    }),
    type: () => 'SyncedCounter'
  }) as SyncedCounter
  
  syncedCounterActor = syncedCounter
  
  if (typeof window !== 'undefined') {
    (window as any).syncedCounter = syncedCounter
  }
  
  const initialValue = store.data.count
  if (initialValue !== undefined) {
    sendToActor(initialValue)
  }
  
  updatePeerCount()
  
  return syncedCounter
}
// embed-end
