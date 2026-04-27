import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
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
          <Route path="test" element={<Navigate to="/interview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
