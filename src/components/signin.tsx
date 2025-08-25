import React, { useState, useEffect } from "react"; // ← make sure useEffect is imported
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient"; // ← assuming this is your client

const Signin: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { signInUser } = UserAuth();
  const navigate = useNavigate();

  // 🧪 Debug listener for postMessage
  useEffect(() => {
    window.addEventListener("message", (e) => {
      console.log("WebApp →", e.data);
    });
  }, []);

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await signInUser(email, password);

    if (!result.success) {
      setError(result.error || "Sign in failed");
      setTimeout(() => setError(null), 3000);
    } else {
      setError(null);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (token) {
        console.log("Posting token:", token); // ← confirm it's firing
        window.postMessage({
          type: "SYNC_TOKEN",
          token
        }, "http://localhost:3000"); // ← use explicit origin
      }

      navigate("/dashboard");
    }
  };

  return (
    <div>
      <form onSubmit={handleSignIn} className="max-w-md m-auto pt-24">
        <h2 className="font-bold pb-2">Sign in</h2>
        <p>
          Don't have an account yet? <Link to="/signup">Sign up</Link>
        </p>
        <div className="flex flex-col py-4">
          <input
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 mt-2 border-2"
            type="email"
            name="email"
            id="email"
            placeholder="Email"
            required
          />
        </div>
        <div className="flex flex-col py-4">
          <input
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 mt-2 border-2"
            type="password"
            name="password"
            id="password"
            placeholder="Password"
            required
          />
        </div>
        <button className="w-full mt-4" type="submit">Sign In</button>
        {error && <p className="text-red-600 text-center pt-4">{error}</p>}
      </form>
    </div>
  );
};

export default Signin;