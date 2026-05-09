import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AuthPage } from "./pages/AuthPage";
import { FitPreviewPage } from "./pages/FitPreviewPage";
import { InterviewPage } from "./pages/InterviewPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/match" replace />} />
          <Route path="match" element={<FitPreviewPage />} />
          <Route path="interview" element={<InterviewPage />} />
          <Route path="auth/:mode" element={<AuthPage />} />
          <Route path="login" element={<Navigate to="/auth/login" replace />} />
          <Route
            path="register"
            element={<Navigate to="/auth/register" replace />}
          />
          <Route path="test" element={<Navigate to="/interview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
