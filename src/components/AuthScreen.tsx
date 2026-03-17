import React, { useState } from "react";
import { Mic } from "lucide-react";
import { supabase } from "../lib/supabase";

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else onAuthenticated();
    setAuthSubmitting(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError("✓ Check your email to confirm your account!");
    setAuthSubmitting(false);
  };

  return (
    <div className="flex h-screen bg-stone-50 items-center justify-center">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-10 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <Mic className="text-emerald-600" size={24} />
          <h1 className="text-2xl font-bold tracking-tight">Ploki</h1>
        </div>
        <h2 className="text-lg font-medium mb-1">
          {authMode === "signin" ? "Sign in" : "Create account"}
        </h2>
        <p className="text-stone-500 text-sm mb-6">
          {authMode === "signin" ? "Welcome back." : "Start writing your screenplay."}
        </p>
        <form onSubmit={authMode === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
          <input
            type="email"
            value={authEmail}
            onChange={e => setAuthEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
          />
          <input
            type="password"
            value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full px-4 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
          />
          {authError && (
            <p className={`text-xs ${authError.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
              {authError}
            </p>
          )}
          <button
            type="submit"
            disabled={authSubmitting}
            className="w-full px-4 py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {authSubmitting ? "..." : authMode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="text-center text-stone-500 text-xs mt-4">
          {authMode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); }}
            className="text-stone-900 font-medium underline"
          >
            {authMode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};
