/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 设计令牌 → CSS 变量（src/tokens.css，由 scaffold_react.mjs 依 IR 覆写）
        primary: 'var(--color-primary)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        foreground: 'var(--color-text)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
      },
      borderRadius: {
        md: 'var(--radius-md, 8px)',
        lg: 'var(--radius-lg, 12px)',
      },
    },
  },
  plugins: [],
}
