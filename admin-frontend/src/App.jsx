import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Companies from './pages/Companies.jsx';
import Support from './pages/Support.jsx';
import PasswordResets from './pages/PasswordResets.jsx';
import ClientErrors from './pages/ClientErrors.jsx';
import LegalDocs from './pages/LegalDocs.jsx';
import JournalTypes from './pages/JournalTypes.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="companies" element={<Companies />} />
        <Route path="support" element={<Support />} />
        <Route path="password-resets" element={<PasswordResets />} />
        <Route path="client-errors" element={<ClientErrors />} />
        <Route path="legal" element={<LegalDocs />} />
        <Route path="journal-types" element={<JournalTypes />} />
      </Route>
    </Routes>
  );
}
