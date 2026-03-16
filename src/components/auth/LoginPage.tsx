import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const { signIn, signUp, error, clearError, loading } = useAuthStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!email.trim() || !password.trim()) return;

    let success: boolean;
    if (mode === "signup") {
      success = await signUp(email.trim(), password);
    } else {
      success = await signIn(email.trim(), password);
    }

    if (success) {
      onAuthenticated();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Fluido
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {mode === "signin" ? "Sign in to sync your progress" : "Create an account"}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-3 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
              className="w-full px-3 py-3 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium text-sm
                       hover:bg-blue-700 active:bg-blue-800 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); clearError(); }}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); clearError(); }}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
