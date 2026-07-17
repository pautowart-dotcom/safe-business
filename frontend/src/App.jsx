import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Visits from './pages/Visits.jsx';
import Finance from './pages/Finance.jsx';
import Supplies from './pages/Supplies.jsx';
import Checklists from './pages/Checklists.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Security from './pages/Security.jsx';
import Users from './pages/Users.jsx';

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
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="visits" element={<Visits />} />
        <Route
          path="finance"
          element={
            <PrivateRoute ownerOnly>
              <Finance />
            </PrivateRoute>
          }
        />
        <Route path="supplies" element={<Supplies />} />
        <Route path="checklists" element={<Checklists />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="security" element={<Security />} />
        <Route
          path="users"
          element={
            <PrivateRoute ownerOnly>
              <Users />
            </PrivateRoute>
          }
        />
      </Route>
    </Routes>
  );
}
