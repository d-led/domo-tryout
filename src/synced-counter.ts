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
const defaultWsServer = 'ws://localhost:9870'

// Use params option to pass secret (y-websocket will add it as query param to the room URL)
const wsProvider = new WebsocketProvider(WS_SERVER || defaultWsServer, 'domo-actors-counter', doc, {
  params: {
    secret: WS_SECRET
  }
})
const awareness = wsProvider.awareness

// Track initial connection state
let isConnected = false

// Set awareness state immediately (will be synced when connected)
const awarenessState = {
  clientID: doc.clientID
}
awareness.setLocalStateField('user', awarenessState)

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
const peerActivity = new Map<number, number>()
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
  if (wsProvider.ws && wsProvider.ws.readyState === WebSocket.OPEN) {
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
      ...awarenessState,
      timestamp: Date.now()
    })
    
    // Keep awareness alive with heartbeat
    if (heartbeatTimer === null) {
      heartbeatTimer = window.setInterval(() => {
        if (isConnected) {
          awareness.setLocalStateField('user', {
            ...awarenessState,
            timestamp: Date.now()
          })
        }
      }, 5000)
    }
    // Small delay to let awareness sync
    setTimeout(() => updatePeerCount(), 100)
  } else if (status === 'disconnected') {
    isConnected = false
    updateConnectionStatus(false)
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    // Clear peer activity and update count to 0 immediately
    peerActivity.clear()
    // Force peer count to 0 (1 - 1 = 0, excluding self)
    peerCount = 0
    const el = document.getElementById('peer-count')
    if (el) {
      el.textContent = '0'
    }
    // Also clear awareness states to ensure clean state
    awareness.setLocalState(null)
  }
})

// Initialize connection status as disconnected
updateConnectionStatus(false)

// Set up click handler for manual reconnection
setupConnectionStatusClickHandler()

function updatePeerCount() {
  // If disconnected, show 0 peers (1 - 1 = 0, excluding self)
  if (!isConnected) {
    peerCount = 0
    const el = document.getElementById('peer-count')
    if (el) {
      el.textContent = '0'
    }
    return
  }

  const now = Date.now()
  const timeoutMs = 3000
  const selfClientID = doc.clientID
  
  // Get current awareness states
  const awarenessStates = awareness.getStates()
  const awarenessPeerIDs = new Set(Array.from(awarenessStates.keys()))
  
  // Remove peers from peerActivity if they're not in current awareness states
  // This handles cases where Yjs hasn't fired the 'removed' event yet
  peerActivity.forEach((lastActivity, clientID) => {
    if (!awarenessPeerIDs.has(clientID)) {
      // Peer is no longer in awareness states - remove immediately
      peerActivity.delete(clientID)
    } else if (now - lastActivity > timeoutMs) {
      // Peer is in awareness but hasn't been active - remove after timeout
      peerActivity.delete(clientID)
    }
  })
  
  // Update activity timestamps for current awareness states
  awarenessPeerIDs.forEach(clientID => {
    if (peerActivity.has(clientID)) {
      // Update existing entry (don't reset timestamp if already exists)
      // This allows the timeout to work properly
      const existingTime = peerActivity.get(clientID)
      if (existingTime && now - existingTime < timeoutMs) {
        // Keep existing timestamp if still valid
        // Only update if it's about to expire
      } else {
        // Set new timestamp
        peerActivity.set(clientID, now)
      }
    } else {
      // New peer - add with current timestamp
      peerActivity.set(clientID, now)
    }
  })
  
  // Count only other peers (exclude self) - 1 - 1 = 0 when only self
  let activePeerCount = 0
  peerActivity.forEach((_, clientID) => {
    if (clientID !== selfClientID) {
      activePeerCount++
    }
  })
  
  // Always update if count changed
  if (activePeerCount !== peerCount) {
    peerCount = activePeerCount
    const el = document.getElementById('peer-count')
    if (el) {
      el.textContent = peerCount.toString()
    }
  }
}

awareness.on('update', ({ added, updated, removed }) => {
  if (!isConnected) return // Ignore awareness updates when disconnected
  
  const now = Date.now()
  added.forEach(clientID => peerActivity.set(clientID, now))
  updated.forEach(clientID => peerActivity.set(clientID, now))
  removed.forEach(clientID => peerActivity.delete(clientID))
  updatePeerCount()
})

setInterval(() => {
  updatePeerCount()
}, 1000)

// Transport callbacks send messages to actor via interface (unidirectional messaging)
observeDeep(store, () => {
  if (!isConnected) {
    // Still send value to actor even when disconnected (for local state)
    const newValue = store.data.count || 0
    sendToActor(newValue)
    return
  }
  
  const now = Date.now()
  awareness.getStates().forEach((state, clientID) => {
    peerActivity.set(clientID, now)
  })
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
  
  // Don't add self to peerActivity - we only count other peers
  updatePeerCount()
  
  return syncedCounter
}
// embed-end
