export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">paperchat</h1>
          <p className="text-xs text-muted-foreground">
            Chat with your documents
          </p>
        </div>
        <div className="space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
