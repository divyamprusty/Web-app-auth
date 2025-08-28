import React from "react";
import type { ReactNode } from "react";
import { UserAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

type PrivateRouteProps = {
  children: ReactNode;
};

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { session, loading } = UserAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/signin" />;
  return <>{children}</>;
};

export default PrivateRoute;