"use client";

export function PasswordToggle({ shown, onToggle, locale }: { shown: boolean; onToggle: () => void; locale: "en" | "ar" }) {
  return <button type="button" onClick={onToggle} aria-pressed={shown} aria-label={locale === "ar" ? (shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور") : (shown ? "Hide password" : "Show password")}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {shown && <path d="m3 3 18 18" />}
    </svg>
  </button>;
}
