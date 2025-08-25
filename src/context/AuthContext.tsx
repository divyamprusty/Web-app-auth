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

  const broadcastAuthStateToExtension = (supabaseSession: Session | null) => {
    try {
      // Send to the content script (picked up via window message)
      window.postMessage(
        {
          source: "WEB_APP",
          type: "SUPABASE_AUTH_STATE",
          payload: supabaseSession,
        },
        "*"
      );
    } catch {
      // ignore
    }
  };

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
    // Get initial session and broadcast to extension so it can sync
    supabase.auth.getSession().then(({ data }) => {
      const current = data.session ?? null;
      setSession(current);
      broadcastAuthStateToExtension(current);
    });

    // Listen for auth state changes from Supabase and broadcast them
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      broadcastAuthStateToExtension(newSession ?? null);
    });

    // Listen for messages from the extension
    const handleMessage = async (event: MessageEvent) => {
      if (!event || !event.data || typeof event.data !== "object") return;
      const data = event.data as { source?: string; type?: string; payload?: any };
      if (data.source !== "EXTENSION") return;

      if (data.type === "EXTENSION_SET_SESSION") {
        const tokens = data.payload as { access_token?: string; refresh_token?: string };
        if (tokens && tokens.access_token && tokens.refresh_token) {
          await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
        }
      }

      if (data.type === "EXTENSION_SIGN_OUT") {
        await supabase.auth.signOut();
      }
    };

    window.addEventListener("message", handleMessage);

    // Cleanup
    return () => {
      window.removeEventListener("message", handleMessage);
      subscription?.subscription.unsubscribe();
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
};