import { http, HttpResponse } from 'msw'

// daedalus MSW handlers 占位：scaffold_react.mjs 将依据 IR dataContract + fixtures
// 生成 GET /api/<entity 复数小写> 端点并覆写本文件。
export const handlers = [
  http.get('/api/ping', () => HttpResponse.json({ ok: true })),
]
