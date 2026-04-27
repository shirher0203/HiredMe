import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { FitPreviewPage } from "./pages/FitPreviewPage";
import { TestPage } from "./pages/TestPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/match" replace />} />
          <Route path="match" element={<FitPreviewPage />} />
          <Route path="test" element={<TestPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
