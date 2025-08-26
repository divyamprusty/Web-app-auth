import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type AuthContextType = {
  signUpNewUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  session: Session | null;
  signOut: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthContextProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const applyingExternalRef = useRef<boolean>(false);

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
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      setLoading(false);
      if (s) {
        window.postMessage(
          { type: "SYNC_TOKEN", source: "web", token: { access_token: s.access_token, refresh_token: s.refresh_token } },
          window.origin
        );
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      setLoading(false);
      if (applyingExternalRef.current) return;

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && s) {
        window.postMessage(
          { type: "SYNC_TOKEN", source: "web", token: { access_token: s.access_token, refresh_token: s.refresh_token } },
          window.origin
        );
      } else if (event === "SIGNED_OUT") {
        window.postMessage({ type: "SYNC_TOKEN", source: "web", token: null }, window.origin);
      }
    });

    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.origin) return;
      const msg = event.data as {
        type?: string;
        source?: "web" | "popup" | "extension";
        token?: { access_token: string; refresh_token: string } | null;
      };
      if (msg?.type !== "SYNC_TOKEN" || msg.source === "web") return;

      if (msg.token?.access_token && msg.token?.refresh_token) {
        const current = (await supabase.auth.getSession()).data.session;
        if (current && current.access_token === msg.token.access_token) return;

        applyingExternalRef.current = true;
        try {
          await supabase.auth.setSession({
            access_token: msg.token.access_token,
            refresh_token: msg.token.refresh_token,
          });
        } finally {
          applyingExternalRef.current = false;
        }
      } else {
        applyingExternalRef.current = true;
        try {
          await supabase.auth.signOut({ scope: "local" });
        } finally {
          applyingExternalRef.current = false;
        }
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      subscription?.subscription.unsubscribe();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider value={{ signUpNewUser, signInUser, session, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const UserAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("UserAuth must be used within AuthContextProvider");
  return context;
};