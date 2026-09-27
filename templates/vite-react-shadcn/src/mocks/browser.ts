import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// daedalus MSW browser worker（DEV 模式由 src/main.tsx 启动）
export const worker = setupWorker(...handlers)
