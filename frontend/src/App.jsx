import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import { PullToRefreshProvider } from './context/PullToRefreshContext.jsx';
import Login from './pages/Login.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import LegalDocument from './pages/LegalDocument.jsx';
import JournalVerify from './pages/JournalVerify.jsx';
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
import Journals from './pages/Journals.jsx';
import AdminJournalTypes from './pages/AdminJournalTypes.jsx';
import Dossier from './pages/Dossier.jsx';
import Settings from './pages/Settings.jsx';
import Feedback from './pages/Feedback.jsx';
import More from './pages/More.jsx';
import Subscription from './pages/Subscription.jsx';
import Support from './pages/Support.jsx';
import Deadlines from './pages/Deadlines.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/legal/:key" element={<LegalDocument />} />
      <Route path="/j/:token" element={<JournalVerify />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <PullToRefreshProvider>
              <Layout />
            </PullToRefreshProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="clients"
          element={
            <PrivateRoute requireModule="clients">
              <Clients />
            </PrivateRoute>
          }
        />
        <Route
          path="visits"
          element={
            <PrivateRoute requireModule="visits">
              <Visits />
            </PrivateRoute>
          }
        />
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
            <PrivateRoute managementOnly>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="branches"
          element={
            <PrivateRoute managementOnly>
              <Branches />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/legal"
          element={
            <PrivateRoute managementOnly>
              <AdminLegalDocs />
            </PrivateRoute>
          }
        />
        <Route
          path="feedback"
          element={
            <PrivateRoute managementOnly>
              <Feedback />
            </PrivateRoute>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="support" element={<Support />} />
        <Route path="deadlines" element={<Deadlines />} />
        <Route path="journals" element={<Journals />} />
        <Route
          path="dossier"
          element={
            <PrivateRoute managementOnly>
              <Dossier />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/journal-types"
          element={
            <PrivateRoute managementOnly>
              <AdminJournalTypes />
            </PrivateRoute>
          }
        />
        <Route path="more" element={<More />} />
      </Route>
    </Routes>
  );
}
