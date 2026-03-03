import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'https://r9qaeyrgf9.execute-api.ap-south-1.amazonaws.com/prod',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
                secure: true,
            },
        },
    },
})
