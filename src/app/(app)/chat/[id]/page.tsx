import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/chat/ChatPanel";

interface ChatPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { id } = await params;
  const { q: initialQuestion } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth redirect is handled by middleware (307 Temporary Redirect).
  // Do NOT use redirect("/login") in Server Components — it sends 308
  // (Permanent Redirect) which the browser caches permanently, causing
  // redirect loops after the user logs in.
  if (!user) {
    return null;
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*, documents(filename, status)")
    .eq("id", id)
    .single();

  if (error || !conversation) {
    redirect("/");
  }

  // If scoped to a document, check it's ready
  const doc = conversation.documents as { filename: string; status: string } | null;

  if (doc && doc.status !== "ready") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Document still processing
          </h2>
          <p className="text-muted-foreground">
            <strong>{doc.filename}</strong> is still being indexed. You can chat once
            processing is complete.
          </p>
        </div>
      </div>
    );
  }

  const label = doc?.filename ?? "All documents";

  return <ChatPanel conversationId={id} documentFilename={label} initialQuestion={initialQuestion} />;
}
