import { setupWSConnection } from '@y/websocket-server'

const port = process.env.PORT || 10000
const host = process.env.HOST || '0.0.0.0'

const server = await import('http').then(m => m.createServer())

server.on('upgrade', (request, socket, head) => {
  const handleAuth = (ws) => {
    setupWSConnection(ws, request)
  }
  
  const { WebSocketServer } = require('ws')
  const wss = new WebSocketServer({ noServer: true })
  
  wss.handleUpgrade(request, socket, head, handleAuth)
})

server.listen(port, host, () => {
  console.log(`Yjs WebSocket server running on ${host}:${port}`)
})

