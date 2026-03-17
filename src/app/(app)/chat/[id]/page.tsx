import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/chat/ChatPanel";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch conversation with document info
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*, documents(filename, status)")
    .eq("id", id)
    .single();

  if (error || !conversation) {
    redirect("/");
  }

  const doc = conversation.documents as { filename: string; status: string } | null;
  const filename = doc?.filename ?? "Unknown document";
  const isReady = doc?.status === "ready";

  if (!isReady) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Document still processing
          </h2>
          <p className="text-muted-foreground">
            <strong>{filename}</strong> is still being indexed. You can chat once
            processing is complete.
          </p>
        </div>
      </div>
    );
  }

  return <ChatPanel conversationId={id} documentFilename={filename} />;
}
