import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute.jsx';
import Layout from './components/Layout.jsx';
import { PullToRefreshProvider } from './context/PullToRefreshContext.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import LegalDocument from './pages/LegalDocument.jsx';
import JournalVerify from './pages/JournalVerify.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Leads from './pages/Leads.jsx';
import Visits from './pages/Visits.jsx';
import Finance from './pages/Finance.jsx';
import Supplies from './pages/Supplies.jsx';
import Services from './pages/Services.jsx';
import Checklists from './pages/Checklists.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Security from './pages/Security.jsx';
import Users from './pages/Users.jsx';
import FeatureFrozen from './pages/FeatureFrozen.jsx';
import Dossier from './pages/Dossier.jsx';
import Settings from './pages/Settings.jsx';
import Feedback from './pages/Feedback.jsx';
import More from './pages/More.jsx';
import Subscription from './pages/Subscription.jsx';
import Support from './pages/Support.jsx';
import Deadlines from './pages/Deadlines.jsx';
import PhotoReports from './pages/PhotoReports.jsx';
import Help from './pages/Help.jsx';
import AiAdvisor from './pages/AiAdvisor.jsx';
import AnonymousAudit from './pages/AnonymousAudit.jsx';
import PublicLeadForm from './pages/PublicLeadForm.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/legal/:key" element={<LegalDocument />} />
      <Route path="/j/:token" element={<JournalVerify />} />
      {/* Разовый аудит без регистрации (19.08.2026) — публичный, вне
          PrivateRoute/Layout, своя авторизация (гостевой JWT в замыкании
          страницы, не в общем localStorage), см. AnonymousAudit.jsx. */}
      <Route path="/audit" element={<AnonymousAudit />} />
      {/* Публичная форма приёма заявок (20.08.2026) — вне PrivateRoute/Layout,
          та же логика, что у /audit выше, см. PublicLeadForm.jsx. */}
      <Route path="/l/:token" element={<PublicLeadForm />} />
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
          path="leads"
          element={
            <PrivateRoute requireModule="leads">
              <Leads />
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
        <Route
          path="ai-advisor"
          element={
            <PrivateRoute ownerOnly>
              <AiAdvisor />
            </PrivateRoute>
          }
        />
        {/* Отдельная страница ассистента заменена плавающим виджетом
            (20.08.2026, Layout.jsx → AiAssistantWidget.jsx) — старая ссылка
            на всякий случай не 404-ит, а просто ведёт на главную. */}
        <Route path="ai-assistant" element={<Navigate to="/" replace />} />
        <Route path="supplies" element={<Supplies />} />
        <Route
          path="services"
          element={
            <PrivateRoute managementOnly>
              <Services />
            </PrivateRoute>
          }
        />
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
        {/* Раздел заморожен 05.08.2026 (владелец: до легализации электронных
            журналов) — Journals.jsx больше никуда не подключён, но не удалён
            на случай, если понадобится включить обратно. */}
        <Route path="journals" element={<FeatureFrozen />} />
        <Route path="photo-reports" element={<PhotoReports />} />
        <Route
          path="dossier"
          element={
            <PrivateRoute managementOnly>
              <Dossier />
            </PrivateRoute>
          }
        />
        <Route path="more" element={<More />} />
        <Route path="help" element={<Help />} />
      </Route>
    </Routes>
  );
}
