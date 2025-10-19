// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "choice" | "signin" | "signup" | "guest";

export default function LandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choice");

  // Sign-in state
  const [siUserId, setSiUserId] = useState("");
  const [siEmail, setSiEmail] = useState("");
  const [siLoading, setSiLoading] = useState(false);
  const [siError, setSiError] = useState("");

  // Sign-up state
  const [suUserId, setSuUserId] = useState("");
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suDob, setSuDob] = useState("");
  const [suLoading, setSuLoading] = useState(false);
  const [suError, setSuError] = useState("");

  // Guest state
  const [gName, setGName] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gLoading, setGLoading] = useState(false);
  const [gError, setGError] = useState("");

  // If already authenticated, go to /home
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (res.ok) {
          const j = await res.json();
          if (j?.user) router.replace("/home");
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const onSignin = async () => {
    setSiLoading(true);
    setSiError("");
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: siUserId.trim(), email: siEmail.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setSiError(j?.error || "Sign in failed.");
      } else {
        router.replace("/home");
      }
    } catch {
      setSiError("Network error. Please try again.");
    } finally {
      setSiLoading(false);
    }
  };

  const onSignup = async () => {
    setSuLoading(true);
    setSuError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: suUserId.trim(),
          name: suName.trim(),
          email: suEmail.trim(),
          phone: suPhone.trim(),
          dob: suDob,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setSuError(j?.error || "Signup failed.");
      } else {
        router.replace("/home");
      }
    } catch {
      setSuError("Network error. Please try again.");
    } finally {
      setSuLoading(false);
    }
  };

  const onGuestStart = () => {
    setMode("guest");
    setGError("");
  };

  const onGuestContinue = () => {
    setGLoading(true);
    setGError("");
    try {
      const name = gName.trim();
      const phone = gPhone.trim();
      if (!name || !phone) {
        setGError("Please enter guest name and phone.");
        setGLoading(false);
        return;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("kreede:guest", JSON.stringify({ name, phone, at: Date.now() }));
      }
      router.replace("/book?guest=1");
    } catch {
      setGError("Something went wrong. Please try again.");
      setGLoading(false);
    }
  };

  return (
    <div className="hero">
      <header className="hero-header" style={{ textAlign: "center", padding: "24px 16px" }}>
        <h1 className="hero-title" style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
          Welcome to KREEDE
        </h1>
      </header>

      <main className={`hero-center ${mode === "choice" ? "choice-mode" : ""}`}>
        {mode === "choice" && (
          <div className="center-stack" style={{ maxWidth: 320 }}>
            <button className="btn btn-primary" onClick={() => setMode("signin")}>
              Member
            </button>
            <button className="btn btn-ghost" onClick={() => setMode("signup")}>
              Become a Member
            </button>
            <div style={{ height: 12 }} />
            <button className="btn btn-ghost" onClick={onGuestStart}>
              Book as Guest
            </button>
            <div style={{ height: 12 }} />
            {/* ✅ Call & Book button (same style as other buttons) */}
            <a
              href="tel:+919606055181"
              className="btn btn-primary"
              style={{ textAlign: "center", display: "block" }}
            >
              📞 Call & Book
            </a>
          </div>
        )}

        {mode === "signin" && (
          <div className="form-panel form-offset" style={{ maxWidth: 420 }}>
            <h2>Sign In</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ marginBottom: 4 }}>UserID</div>
                <input
                  value={siUserId}
                  onChange={(e) => setSiUserId(e.target.value)}
                  placeholder="Your UserID"
                  autoComplete="username"
                  aria-label="UserID"
                  disabled={siLoading}
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>Email</div>
                <input
                  type="email"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-label="Email"
                  disabled={siLoading}
                />
              </label>
              {siError && <div style={{ color: "#ef4444", fontSize: 14 }}>{siError}</div>}
              <button
                className="btn btn-primary"
                onClick={onSignin}
                disabled={siLoading || !siUserId || !siEmail}
              >
                {siLoading ? "Signing in…" : "Sign In"}
              </button>
              <div className="links">
                Not a member?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signup");
                  }}
                >
                  <u>Become a Member</u>
                </a>
              </div>
              <div className="back">
                <button className="btn btn-ghost" onClick={() => setMode("choice")} disabled={siLoading}>
                  ← Back
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "signup" && (
          <div className="form-panel form-offset" style={{ maxWidth: 520 }}>
            <h2>Sign Up</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ marginBottom: 4 }}>UserID</div>
                <input
                  value={suUserId}
                  onChange={(e) => setSuUserId(e.target.value)}
                  placeholder="Choose a UserID"
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>Name</div>
                <input
                  value={suName}
                  onChange={(e) => setSuName(e.target.value)}
                  placeholder="Your full name"
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>Email</div>
                <input
                  type="email"
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>Phone Number</div>
                <input
                  type="tel"
                  value={suPhone}
                  onChange={(e) => setSuPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>DOB</div>
                <input type="date" value={suDob} onChange={(e) => setSuDob(e.target.value)} />
              </label>
              {suError && <div style={{ color: "#ef4444", fontSize: 14 }}>{suError}</div>}
              <button
                className="btn btn-primary"
                onClick={onSignup}
                disabled={!suUserId || !suName || !suEmail || suLoading}
              >
                {suLoading ? "Signing up…" : "Sign Up"}
              </button>
              <div className="links">
                Already a Member?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signin");
                  }}
                >
                  <u>Sign In</u>
                </a>
              </div>
              <div className="back">
                <button className="btn btn-ghost" onClick={() => setMode("choice")} disabled={suLoading}>
                  ← Back
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "guest" && (
          <div className="form-panel form-offset" style={{ maxWidth: 420 }}>
            <h2>Book as Guest</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <label>
                <div style={{ marginBottom: 4 }}>Guest Name</div>
                <input
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Your full name"
                  aria-label="Guest Name"
                  disabled={gLoading}
                />
              </label>
              <label>
                <div style={{ marginBottom: 4 }}>Phone Number</div>
                <input
                  type="tel"
                  value={gPhone}
                  onChange={(e) => setGPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  aria-label="Phone"
                  disabled={gLoading}
                />
              </label>
              {gError && <div style={{ color: "#ef4444", fontSize: 14 }}>{gError}</div>}
              <button
                className="btn btn-primary"
                onClick={onGuestContinue}
                disabled={gLoading || !gName.trim() || !gPhone.trim()}
              >
                {gLoading ? "Starting…" : "Continue to Book"}
              </button>
              <div className="back">
                <button className="btn btn-ghost" onClick={() => setMode("choice")} disabled={gLoading}>
                  ← Back
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
