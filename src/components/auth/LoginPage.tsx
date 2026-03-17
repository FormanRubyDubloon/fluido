import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Fluido</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {mode === "signin" ? "Sign in to sync your progress" : "Create an account"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-1p-group>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email.trim() || !password.trim()}
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("signup"); clearError(); }}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); clearError(); }}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
