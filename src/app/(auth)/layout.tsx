export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">paperchat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chat with your documents
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
