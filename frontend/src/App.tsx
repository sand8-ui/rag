import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { ChatPage } from './pages/Chat';
import { HotelDetailPage } from './pages/HotelDetail';
import { HotelListPage } from './pages/HotelList';
import { LoginPage } from './pages/Login';
import { OrdersPage } from './pages/Orders';
import { SearchPage } from './pages/Search';
import { useAuth } from './stores/auth';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<SearchPage />} />
        <Route path="/hotels" element={<HotelListPage />} />
        <Route path="/hotels/:id" element={<HotelDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
