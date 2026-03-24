import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import './index.css'
import { SpiralDemo } from '@/components/spiral-demo'
import { DashboardContent } from '@/components/dashboard-content'

// Use local monaco-editor instead of CDN — prevents "Loading..." hang
loader.config({ monaco })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SpiralDemo />} />
        <Route path="/dashboard" element={<DashboardContent />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
