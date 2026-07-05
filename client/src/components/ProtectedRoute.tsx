import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthSession } from "../services/auth";

export function ProtectedRoute() {
  const location = useLocation();
  const session = getAuthSession();

  if (!session) {
    return (
      <Navigate
        to="/auth/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}
