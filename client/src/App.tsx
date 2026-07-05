import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ApplicationsBoardPage } from "./pages/ApplicationsBoardPage";
import { AuthPage } from "./pages/AuthPage";
import { FitPreviewPage } from "./pages/FitPreviewPage";
import { InterviewPage } from "./pages/InterviewPage";
import { MatchResultPage } from "./pages/MatchResultPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/auth/login" replace />} />
          <Route path="auth/:mode" element={<AuthPage />} />
          <Route path="login" element={<Navigate to="/auth/login" replace />} />
          <Route
            path="register"
            element={<Navigate to="/auth/register" replace />}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="match" element={<FitPreviewPage />} />
            <Route path="match/result" element={<MatchResultPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="interview" element={<InterviewPage />} />
            <Route path="applications" element={<ApplicationsBoardPage />} />
            <Route path="test" element={<Navigate to="/interview" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
