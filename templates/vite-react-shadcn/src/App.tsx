// daedalus 模板占位 App：scaffold_react.mjs 会依据 IR 覆写为 HashRouter 路由结构
export default function App() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 text-foreground">
      <div className="w-full max-w-md space-y-2 rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">daedalus React 模板</h1>
        <p className="text-sm text-muted">
          模板占位页。运行 scaffold_react.mjs 后，本文件与 src/routes/ 将由 IR 生成的路由与页面 stub 覆写。
        </p>
      </div>
    </div>
  )
}
