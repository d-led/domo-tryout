import { Actor, Protocol, stage } from 'domo-actors'
import { syncedStore, getYjsDoc, observeDeep } from '@syncedstore/core'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
// embed-begin
//...
import { Counter } from './Counter.js'

// Create synced store (shared across all users)
// SyncedStore requires object types, so wrap count in an object
const store = syncedStore({ data: {} })
const doc = getYjsDoc(store)

// Set up sync providers FIRST, before initializing count
// Use explicit signaling servers to ensure all browsers connect to the same servers
const SIGNALING_SERVERS = [
  'wss://y-webrtc-eu.fly.dev',
  // 'wss://signaling.yjs.dev',
  // 'wss://y-webrtc-signaling-eu.herokuapp.com',
  // 'wss://y-webrtc-signaling-us.herokuapp.com'
]
const webrtcProvider = new WebrtcProvider('domo-actors-counter', doc, {
  signaling: SIGNALING_SERVERS
})
const indexeddbProvider = new IndexeddbPersistence('domo-actors-counter', doc)

// Only initialize count to 0 AFTER IndexedDB has loaded persisted state
// This prevents resetting the count when a browser reloads
indexeddbProvider.on('synced', () => {
  // Only set default if count is truly undefined (not just 0)
  if (store.data.count === undefined) {
    store.data.count = 0
  }
})

// Log which signaling servers are being used
console.log('Signaling servers:', webrtcProvider.signalingUrls)

// Track connected signaling servers for UI display
const connectedServers = new Set<string>()

function updateSignalingServersDisplay() {
  const el = document.getElementById('signaling-servers')
  if (el) {
    if (connectedServers.size === 0) {
      el.textContent = 'Connecting...'
      el.className = 'small text-muted'
    } else {
      const servers = Array.from(connectedServers).map(url => {
        // Shorten URL for display
        const match = url.match(/\/\/([^/]+)/)
        return match ? match[1] : url
      })
      el.textContent = servers.join(', ')
      el.className = 'small text-success'
    }
  }
}

// Log signaling connection status
webrtcProvider.on('status', ({ connected }) => {
  console.log('WebRTC provider status:', connected ? 'connected' : 'disconnected')
  // If WebRTC is connected, at least one signaling server must be working
  if (connected && connectedServers.size === 0) {
    // Show the first signaling server as connected since WebRTC is working
    const firstServer = webrtcProvider.signalingConns[0]
    if (firstServer) {
      console.log('✓ WebRTC connected, showing first signaling server:', firstServer.url)
      connectedServers.add(firstServer.url)
      updateSignalingServersDisplay()
    }
  }
})

// Log when signaling connections are established (set up after provider is created)
// Check connections periodically since they connect asynchronously  
function setupSignalingConnectionListeners() {
  // Wait for connections to be created
  setTimeout(() => {
    console.log('Checking signaling connections, count:', webrtcProvider.signalingConns.length)
    webrtcProvider.signalingConns.forEach(conn => {
      const serverUrl = conn.url
      const isConnected = (conn as any).connected
      console.log('Signaling conn:', serverUrl, 'connected:', isConnected)
      
      // Check current connection state - WebsocketClient has a 'connected' property
      if (isConnected) {
        console.log('✓ Adding connected server:', serverUrl)
        connectedServers.add(serverUrl)
        updateSignalingServersDisplay()
      }
      
      // Listen for connection events
      if (typeof conn.on === 'function') {
        conn.on('connect', () => {
          console.log('✓ Signaling server connected:', serverUrl)
          connectedServers.add(serverUrl)
          updateSignalingServersDisplay()
        })
        conn.on('disconnect', () => {
          console.log('✗ Signaling server disconnected:', serverUrl)
          connectedServers.delete(serverUrl)
          updateSignalingServersDisplay()
        })
      }
    })
    console.log('Connected servers after initial check:', Array.from(connectedServers))
    updateSignalingServersDisplay()
  }, 2000) // Wait longer for connections to establish
}

// Set up listeners
setupSignalingConnectionListeners()

// Also check periodically - check the 'connected' property directly
setInterval(() => {
  // If WebRTC is connected, ensure at least one server is shown
  const isWebRTCConnected = webrtcProvider.connected
  
  webrtcProvider.signalingConns.forEach(conn => {
    // Check both the 'connected' property and WebSocket readyState
    const ws = (conn as any).ws
    const isConnected = (conn as any).connected || (ws && ws.readyState === 1) // WebSocket.OPEN = 1
    
    if (isConnected && !connectedServers.has(conn.url)) {
      console.log('✓ Found connected signaling server:', conn.url, 'ws.readyState:', ws?.readyState)
      connectedServers.add(conn.url)
      updateSignalingServersDisplay()
    } else if (!isConnected && connectedServers.has(conn.url) && !isWebRTCConnected) {
      // Only remove if WebRTC is also disconnected
      console.log('✗ Signaling server disconnected:', conn.url)
      connectedServers.delete(conn.url)
      updateSignalingServersDisplay()
    }
  })
  
  // If WebRTC is connected but no servers shown, show the first one
  if (isWebRTCConnected && connectedServers.size === 0) {
    const firstServer = webrtcProvider.signalingConns[0]
    if (firstServer) {
      connectedServers.add(firstServer.url)
      updateSignalingServersDisplay()
    }
  }
}, 1000)

// Track peer count with activity timeout
let peerCount = 1 // Start with self
const peerActivity = new Map<number, number>() // Map of clientID -> last activity timestamp

function updatePeerCount() {
  const awareness = webrtcProvider.awareness
  const now = Date.now()
  const timeoutMs = 3000 // 3 seconds
  
  // Remove inactive peers (don't update activity here - only remove timeouts)
  peerActivity.forEach((lastActivity, clientID) => {
    if (now - lastActivity > timeoutMs) {
      peerActivity.delete(clientID)
    }
  })
  
  // Count active peers (including self)
  const activePeerCount = peerActivity.size
  if (activePeerCount !== peerCount) {
    peerCount = activePeerCount
    const el = document.getElementById('peer-count')
    if (el) el.textContent = peerCount.toString()
    console.log('Peer count updated:', peerCount, 'active peers', Array.from(peerActivity.keys()))
  }
}

// Listen for peer changes - track activity when awareness updates
webrtcProvider.awareness.on('update', ({ added, updated, removed }) => {
  const now = Date.now()
  // Mark changed peers as active (only when they actually change)
  added.forEach(clientID => {
    peerActivity.set(clientID, now)
    console.log('Peer added:', clientID)
  })
  updated.forEach(clientID => {
    peerActivity.set(clientID, now)
    console.log('Peer updated:', clientID)
  })
  removed.forEach(clientID => {
    peerActivity.delete(clientID)
    console.log('Peer removed:', clientID)
  })
  updatePeerCount()
})

// Also listen to provider's peers event
webrtcProvider.on('peers', ({ added, removed }) => {
  console.log('Peers event:', { added, removed })
  updatePeerCount()
})

// Check for inactive peers every second
setInterval(() => {
  updatePeerCount()
}, 1000)

class CounterActor extends Actor implements Counter {
  constructor() {
    super()
  }

  initialize() {
    // Wait for IndexedDB to load persisted state, then initialize
    indexeddbProvider.on('synced', () => {
      this.update()
    })
    
    // Initialize immediately (will update again when IndexedDB loads)
    this.update()
    
    // Listen for changes from other users
    observeDeep(store, () => {
      // Mark all current peers as active when store changes
      const now = Date.now()
      webrtcProvider.awareness.getStates().forEach((state, clientID) => {
        peerActivity.set(clientID, now)
      })
      updatePeerCount()
      this.update()
    })
  }

  increment() {
    store.data.count = (store.data.count || 0) + 1
    this.update()
  }

  decrement() {
    store.data.count = (store.data.count || 0) - 1
    this.update()
  }

  private update() {
    const el = document.getElementById('synced-count')
    if (el) el.textContent = (store.data.count || 0).toString()
  }
}

// Export function to create synced counter (called after stage is ready)
export function createSyncedCounter() {
  const appStage = (window as any).appStage || stage()
  const syncedCounter = appStage.actorFor<Counter>({
    instantiator: () => ({
      instantiate: () => {
        const actor = new CounterActor()
        // Initialize after actor is created
        setTimeout(() => actor.initialize(), 0)
        return actor
      }
    }),
    type: () => 'SyncedCounter'
  })
  
  if (typeof window !== 'undefined') {
    (window as any).syncedCounter = syncedCounter
    console.log('Synced counter initialized')
  }
  
  // Initialize peer count display - add self to activity map
  const selfClientID = doc.clientID
  peerActivity.set(selfClientID, Date.now())
  updatePeerCount()
  
  return syncedCounter
}
// embed-end


