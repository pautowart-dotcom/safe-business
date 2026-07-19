import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import LegalDocument from './pages/LegalDocument.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Visits from './pages/Visits.jsx';
import Finance from './pages/Finance.jsx';
import Supplies from './pages/Supplies.jsx';
import Checklists from './pages/Checklists.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Security from './pages/Security.jsx';
import Users from './pages/Users.jsx';
import Branches from './pages/Branches.jsx';
import AdminLegalDocs from './pages/AdminLegalDocs.jsx';
import Settings from './pages/Settings.jsx';
import Feedback from './pages/Feedback.jsx';
import More from './pages/More.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/legal/:key" element={<LegalDocument />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="visits" element={<Visits />} />
        <Route path="finance" element={<Finance />} />
        <Route path="supplies" element={<Supplies />} />
        <Route path="shift" element={<Checklists />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route
          path="security"
          element={
            <PrivateRoute ownerOnly>
              <Security />
            </PrivateRoute>
          }
        />
        <Route
          path="team"
          element={
            <PrivateRoute ownerOnly>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="branches"
          element={
            <PrivateRoute ownerOnly>
              <Branches />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/legal"
          element={
            <PrivateRoute ownerOnly>
              <AdminLegalDocs />
            </PrivateRoute>
          }
        />
        <Route
          path="feedback"
          element={
            <PrivateRoute ownerOnly>
              <Feedback />
            </PrivateRoute>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="more" element={<More />} />
      </Route>
    </Routes>
  );
}
