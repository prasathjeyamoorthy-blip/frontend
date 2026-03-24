import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { SpiralDemo } from '@/components/spiral-demo'
import { DashboardContent } from '@/components/dashboard-content'

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
