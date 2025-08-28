import React, { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";

const Signup: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const { signUpNewUser } = UserAuth();
  const navigate = useNavigate();

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const result = await signUpNewUser(email, password);

    if (result.success) {
      setError(null);
      navigate("/dashboard");
    } else {
      setError(result.error || "Sign up failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0f14", color: "#e5e7eb", padding: 16 }}>
      <form onSubmit={handleSignUp} style={{ width: "100%", maxWidth: 420, background: "#0f172a", border: "1px solid #1f2937", borderRadius: 12, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
        <h2 style={{ fontSize: 22, margin: 0, marginBottom: 6, color: "#e2e8f0" }}>Create your account</h2>
        <p style={{ margin: 0, marginBottom: 16, color: "#94a3b8" }}>
          Already have an account? <Link to="/" style={{ color: "#93c5fd" }}>Sign in</Link>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="email" style={{ display: "block", fontSize: 12, color: "#9ca3af" }}>Email</label>
            <input
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 10, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}
              type="email"
              name="email"
              id="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: "block", fontSize: 12, color: "#9ca3af" }}>Password</label>
            <input
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: 12, borderRadius: 10, border: "1px solid #1f2937", background: "#0b1220", color: "#e5e7eb" }}
              type="password"
              name="password"
              id="password"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 4, padding: "12px 16px", borderRadius: 9999, border: "1px solid #1d4ed8", background: loading ? "#0b1220" : "#0b1220", color: "#93c5fd", cursor: loading ? "default" : "pointer", opacity: loading ? 0.8 : 1 }}>
            {loading ? "Signing up..." : "Sign Up"}
          </button>
          {error && <p style={{ color: "#fca5a5", textAlign: "center", paddingTop: 8 }}>{error}</p>}
        </div>
      </form>
    </div>
  );
};

export default Signup;