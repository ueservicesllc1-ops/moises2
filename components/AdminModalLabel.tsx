'use client'

import React from 'react'

/**
 * AdminModalLabel - Muestra el nombre del modal solo para el administrador
 * Disable for production by returning null.
 */
interface AdminModalLabelProps {
  modalName: string
}

const AdminModalLabel: React.FC<AdminModalLabelProps> = ({ modalName }) => {
  // CLEAN PRODUCTION UI: All labels hidden by default.
  return null
}

export default AdminModalLabel;
