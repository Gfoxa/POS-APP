export function CatalogFeedback({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return (
    <p aria-live="polite" className={`catalog-feedback ${error ? "catalog-feedback--error" : "catalog-feedback--success"}`} role={error ? "alert" : "status"}>
      {message}
    </p>
  );
}
