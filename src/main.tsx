import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { router } from "./router";
import { RouterProvider } from "react-router-dom";
import { AuthContextProvider } from "./context/AuthContext";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <>
      {/* <h1 className="text-center text-3xl pt-4">Web App Authentication</h1> */}
      <AuthContextProvider>
        <RouterProvider router={router} />
      </AuthContextProvider>
    </>
  </React.StrictMode>
);