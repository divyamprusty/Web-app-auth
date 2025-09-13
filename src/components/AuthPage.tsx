'use client'

import React, { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { signInUser, signUpNewUser } = useAuth();

  const openChatbotExtension = () => {
    // Send message to content script to open side panel
    window.postMessage({
      type: 'OPEN_SIDE_PANEL',
      source: 'web-app'
    }, window.location.origin);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = isSignUp 
      ? await signUpNewUser(email, password)
      : await signInUser(email, password);

    if (!result.success) {
      setError(result.error || "Authentication failed");
      setTimeout(() => setError(null), 3000);
    }
    
    setLoading(false);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-6 text-center">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-md transition-colors duration-200 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
          </button>
        </form>
        
        {error && (
          <p className="mt-3 text-sm text-red-400 text-center">{error}</p>
        )}
        
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors duration-200"
          >
            {isSignUp 
              ? "Already have an account? Sign In" 
              : "Don't have an account? Sign Up"
            }
          </button>
        </div>
        
        
        <div className="mt-2 text-center">
          <button
            onClick={openChatbotExtension}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors duration-200"
          >
            Open Chatbot Extension
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
