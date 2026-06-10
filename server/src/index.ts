import { listen } from '@colyseus/tools'
import appConfig from './app.config'

// Port 2567 is the Colyseus default. NEVER use 8080/8443/8843/8880 — reserved by the
// UniFi controller on this host (see workspace CLAUDE.md).
const port = Number(process.env.PORT) || 2567

listen(appConfig, port).catch(err => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})
