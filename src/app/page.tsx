'use client'

import { useAuth } from "../contexts/AuthContext";
import AuthPage from "../components/AuthPage";
import ChatbotPage from "../components/ChatbotPage";

export default function HomePage() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  return <ChatbotPage />;
}