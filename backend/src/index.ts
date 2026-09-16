import { createApp, parseListenAddr } from './app.ts'

const listenAddr = process.env.LISTEN_ADDR || ':8080'
const { server } = createApp()
const { host, port } = parseListenAddr(listenAddr)

server.listen(port, host, () => {
  console.log(`pinalove-review listening on ${listenAddr}`)
  console.log(`sqlite=${process.env.SQLITE_PATH ?? './data/pinalove.sqlite'}`)
})
