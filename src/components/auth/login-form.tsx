"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl: "/workspace",
        redirect: false,
      });

      if (!result || result.error) {
        setError("Email atau kata sandi belum sesuai. Coba periksa kembali.");
        return;
      }

      router.replace(result.url ?? "/workspace");
      router.refresh();
    } catch {
      setError("Belum dapat masuk. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="email">Email kerja</label>
      <input
        autoComplete="username"
        className="text-field"
        id="email"
        maxLength={254}
        name="email"
        placeholder="nama@cafe.local"
        required
        type="email"
      />

      <div className="field-label-row">
        <label className="field-label" htmlFor="password">Kata sandi</label>
        <span className="field-hint">Akun demo ada di README</span>
      </div>
      <input
        autoComplete="current-password"
        className="text-field"
        id="password"
        maxLength={72}
        name="password"
        placeholder="Masukkan kata sandi"
        required
        type="password"
      />

      {error && <p className="form-error" role="alert">{error}</p>}

      <button className="button button--primary login-submit" disabled={busy} type="submit">
        {busy ? "Memeriksa akun…" : "Masuk ke ruang kerja"}
        {!busy && <span aria-hidden="true">↗</span>}
      </button>
      <p className="login-security-note">
        <span aria-hidden="true">◈</span> Akses dilindungi sesuai peran akun Anda.
      </p>
    </form>
  );
}
