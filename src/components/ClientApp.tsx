import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { Header } from './Header';

export const ClientApp: React.FC = () => {
  return (
    <AuthProvider>
      <Header />
    </AuthProvider>
  );
};

export default ClientApp;
