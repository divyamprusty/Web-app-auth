import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type AuthContextType = {
  signUpNewUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  session: Session | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthContextProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);

  const signUpNewUser = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const signInUser = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  useEffect(() => {
    // Get initial session and broadcast it
    supabase.auth.getSession().then(({ data }) => {
      const currentSession = data.session ?? null;
      setSession(currentSession);
      window.postMessage(
        { type: "SYNC_TOKEN", token: currentSession?.access_token ?? null },
        window.origin
      );
    });

    // Listen for auth state changes and broadcast
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, changedSession) => {
      const nextSession = changedSession ?? null;
      setSession(nextSession);
      window.postMessage(
        { type: "SYNC_TOKEN", token: nextSession?.access_token ?? null },
        window.origin
      );
    });

    // Receive token sync from extension
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.origin) return;
      const msg = event.data as { type?: string; token?: string | null };
      if (msg?.type !== "SYNC_TOKEN") return;

      if (msg.token) {
        await supabase.auth.setSession({ access_token: msg.token, refresh_token: "" });
      } else {
        await supabase.auth.signOut();
      }
    };
    window.addEventListener("message", onMessage);

    // Cleanup subscription on unmount
    return () => {
      subscription?.subscription.unsubscribe();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ signUpNewUser, signInUser, session, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const UserAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("UserAuth must be used within AuthContextProvider");
  return context;
}