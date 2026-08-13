import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";

export default function Messages() {
  const [user, setUser] = useState(null);
  const [artists, setArtists] = useState([]);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // { otherId, otherName, otherAvatar }
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Arriving with ?to= means we came from a profile. navigate(-1) handles the
  // real journey; these are only the fallback for a direct visit.
  const cameFromProfile = !!searchParams.get("to");
  const backTo = cameFromProfile ? "/artists" : "/community";
  const backLabel = cameFromProfile ? "Back" : "Community";
  const bottomRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      // load all messages involving this user
      const [sent, received] = await Promise.all([
        base44.entities.Message.filter({ sender_id: u.id }),
        base44.entities.Message.filter({ recipient_id: u.id }),
      ]);
      const all = [...sent, ...received];
      // build thread list: unique other-user IDs
      const map = {};
      all.forEach((m) => {
        const otherId = m.sender_id === u.id ? m.recipient_id : m.sender_id;
        const otherName = m.sender_id === u.id ? m.recipient_name : m.sender_name;
        if (!map[otherId]) map[otherId] = { otherId, otherName, lastMsg: m };
        else if (new Date(m.created_date) > new Date(map[otherId].lastMsg.created_date)) {
          map[otherId].lastMsg = m;
        }
      });
      const threadList = Object.values(map).sort((a, b) =>
        new Date(b.lastMsg.created_date) - new Date(a.lastMsg.created_date)
      );
      setThreads(threadList);

      // check for ?to=userId query param (coming from a profile)
      const toId = searchParams.get("to");
      const toName = searchParams.get("name");
      // A profile with no account behind it yields ?to=undefined or ?to=.
      // Both are truthy-ish strings that Postgres later rejects as invalid
      // uuids, so validate the shape before opening a thread against it.
      const isRealId =
        typeof toId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toId);
      if (isRealId && toName) {
        const existing = threadList.find((t) => t.otherId === toId);
        openThread(existing ?? { otherId: toId, otherName: toName }, u, all);
      } else if (threadList.length > 0) {
        openThread(threadList[0], u, all);
      }

      // load artists for avatar lookup
      base44.entities.ArtistProfile.list("-created_date", 100).then(setArtists);
    });
  }, []);

  const openThread = async (thread, currentUser, allMessages) => {
    setActiveThread(thread);
    const u = currentUser || user;
    const msgs = (allMessages || messages).filter(
      (m) =>
        (m.sender_id === u.id && m.recipient_id === thread.otherId) ||
        (m.recipient_id === u.id && m.sender_id === thread.otherId)
    );
    msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    setMessages(msgs);
    // mark unread as read
    const unread = msgs.filter((m) => m.recipient_id === u.id && !m.read);
    unread.forEach((m) => base44.entities.Message.update(m.id, { read: true }));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleOpenThread = async (thread) => {
    const [sent, received] = await Promise.all([
      base44.entities.Message.filter({ sender_id: user.id }),
      base44.entities.Message.filter({ recipient_id: user.id }),
    ]);
    openThread(thread, user, [...sent, ...received]);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!body.trim() || !activeThread || sending) return;
    setSendError("");
    setSending(true);
    try {
      const myProfile = artists.find((a) => a.user_id === user.id);
      const msg = await base44.entities.Message.create({
        sender_id: user.id,
        sender_name: myProfile?.display_name || user.full_name || "Member",
        recipient_id: activeThread.otherId,
        recipient_name: activeThread.otherName,
        body: body.trim(),
        read: false,
      });
      setMessages((prev) => [...prev, msg]);
      setBody("");
      // update thread list
      setThreads((prev) => {
        const exists = prev.find((t) => t.otherId === activeThread.otherId);
        if (exists) {
          return [{ ...exists, lastMsg: msg }, ...prev.filter((t) => t.otherId !== activeThread.otherId)];
        }
        return [{ ...activeThread, lastMsg: msg }, ...prev];
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      // Previously this rejected silently: the box kept the text, nothing
      // sent, and no reason was ever shown.
      const raw = String(err?.message || err);
      setSendError(
        /uuid|not-null|violates/i.test(raw)
          ? "This member does not have an account yet, so they cannot receive messages."
          : "Could not send. Please try again."
      );
    } finally {
      // Must run on failure too, or the send button stays disabled for good.
      setSending(false);
    }
  };

  const getAvatar = (userId) => artists.find((a) => a.user_id === userId)?.avatar_url;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm px-6 py-4 md:px-10 flex items-center justify-between">
        {/* Returning to Community is wrong when the user arrived from a
            profile. Go back in history where we can, and only fall back to
            Community when Messages was opened directly. */}
        <Link
          to={backTo}
          onClick={(e) => {
            if (window.history.length > 1) {
              e.preventDefault();
              navigate(-1);
            }
          }}
          className="flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {backLabel}
        </Link>
        <span className="font-mono-caps text-[11px] text-foreground">Messages</span>
        <div />
      </div>

      <div className="flex h-[calc(100dvh-57px)]">
        {/*
          Mobile shows ONE pane at a time: the conversation list, or the open
          conversation. A fixed 288px sidebar beside the message pane left
          roughly 87px for messages on a 375px phone.

          From md upward both panes sit side by side exactly as before.
        */}
        <div
          className={`${activeThread ? "hidden md:flex" : "flex"} w-full md:w-72 shrink-0 border-r border-border flex-col`}
        >
          <div className="px-5 py-4 border-b border-border">
            <p className="font-mono-caps text-[11px] text-muted-foreground">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 && (
              <div className="p-5">
                <p className="text-sm text-muted-foreground">No conversations yet. Visit an artist's profile to send a message.</p>
              </div>
            )}
            {threads.map((t) => {
              const avatar = getAvatar(t.otherId);
              const isActive = activeThread?.otherId === t.otherId;
              return (
                <button
                  key={t.otherId}
                  onClick={() => handleOpenThread(t)}
                  className={`w-full flex items-center gap-3 px-5 py-4 border-b border-border text-left hover:bg-muted/40 transition-colors ${isActive ? "bg-muted/60" : ""}`}
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                    {avatar
                      ? <Image src={avatar} alt={t.otherName} fittingType="fill" className="h-full w-full object-cover" />
                      : <span className="font-mono-caps text-[10px]">{t.otherName?.[0]}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium truncate">{t.otherName}</p>
                    <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{t.lastMsg?.body}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* message pane */}
        <div className={`${activeThread ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-mono-caps text-[11px] text-muted-foreground">Select a conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 md:px-6 py-4 border-b border-border flex items-center gap-3">
                {/* Without this there is no way back to the list on a phone,
                    because the list is hidden while a thread is open. */}
                <button
                  type="button"
                  onClick={() => setActiveThread(null)}
                  className="md:hidden -ml-1 p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                  {getAvatar(activeThread.otherId)
                    ? <Image src={getAvatar(activeThread.otherId)} alt={activeThread.otherName} fittingType="fill" className="h-full w-full object-cover" />
                    : <span className="font-mono-caps text-[10px]">{activeThread.otherName?.[0]}</span>
                  }
                </div>
                <p className="font-body text-sm font-medium">{activeThread.otherName}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
                {messages.map((m) => {
                  const isMine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-xs md:max-w-md px-4 py-3 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        <p className="text-sm leading-relaxed">{m.body}</p>
                        <p className={`mt-1 font-mono-caps text-[9px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(m.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {sendError && (
                <p className="border-t border-border px-4 md:px-6 pt-4 text-sm text-destructive">
                  {sendError}
                </p>
              )}
              <form onSubmit={sendMessage} className="px-4 md:px-6 py-4 border-t border-border flex items-center gap-3">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 border border-border bg-transparent px-4 py-3 text-sm outline-none focus:border-foreground"
                />
                <button
                  type="submit"
                  disabled={!body.trim() || sending}
                  className="flex items-center gap-2 bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}