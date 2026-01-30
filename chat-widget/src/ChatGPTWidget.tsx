import React, { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; content: string; createdAt: number };

type Thread = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: Msg[];
};

const STORAGE_KEY = "cgpt_widget_threads_v1";

function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function now() {
    return Date.now();
}

function safeLoad(): Thread[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function safeSave(threads: Thread[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {}
}

function formatDate(ts: number) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatGPTWidget({ backendUrl }: { backendUrl: string }) {
    const [threads, setThreads] = useState<Thread[]>(() => {
        const saved = safeLoad();
        if (saved.length) return saved;

        // default thread
        const t: Thread = {
            id: uid(),
            title: "New chat",
            createdAt: now(),
            updatedAt: now(),
            messages: [
                { id: uid(), role: "assistant", content: "Hi! Start a new chat on the left.", createdAt: now() },
            ],
        };
        return [t];
    });

    const [activeId, setActiveId] = useState<string>(() => {
        const saved = safeLoad();
        return saved[0]?.id ?? "";
    });

    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    const activeThread = useMemo(
        () => threads.find((t) => t.id === activeId) ?? threads[0],
        [threads, activeId]
    );

    // persist
    useEffect(() => {
        safeSave(threads);
        if (threads.length && !activeId) setActiveId(threads[0].id);
    }, [threads]);

    // autoscroll
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [activeThread?.messages.length, isTyping]);

    function setActive(threadId: string) {
        setActiveId(threadId);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    function newChat() {
        const t: Thread = {
            id: uid(),
            title: "New chat",
            createdAt: now(),
            updatedAt: now(),
            messages: [{ id: uid(), role: "assistant", content: "What’s on your mind?", createdAt: now() }],
        };
        setThreads((prev) => [t, ...prev]);
        setActiveId(t.id);
    }

    function deleteChat(threadId: string) {
        setThreads((prev) => {
            const next = prev.filter((t) => t.id !== threadId);
            // ensure at least one thread
            if (next.length === 0) {
                const t: Thread = {
                    id: uid(),
                    title: "New chat",
                    createdAt: now(),
                    updatedAt: now(),
                    messages: [{ id: uid(), role: "assistant", content: "New chat started.", createdAt: now() }],
                };
                setActiveId(t.id);
                return [t];
            }
            if (activeId === threadId) setActiveId(next[0].id);
            return next;
        });
    }

    function updateThread(threadId: string, updater: (t: Thread) => Thread) {
        setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? updater(t) : t)).sort((a, b) => b.updatedAt - a.updatedAt)
        );
    }

    function addMessage(role: Role, content: string) {
        if (!activeThread) return;

        const msg: Msg = { id: uid(), role, content, createdAt: now() };
        const threadId = activeThread.id;

        updateThread(threadId, (t) => {
            const nextMessages = [...t.messages, msg];
            const nextTitle =
                t.title === "New chat" && role === "user"
                    ? content.trim().slice(0, 32) || "New chat"
                    : t.title;

            return {
                ...t,
                title: nextTitle,
                messages: nextMessages,
                updatedAt: now(),
            };
        });
    }

    async function callBackend(nextMessages: { role: string; content: string }[]) {
        if (!backendUrl) {
            throw new Error("backendUrl is empty. Pass it from mount().");
        }

        const res = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // send full conversation (recommended)
            body: JSON.stringify({ messages: nextMessages }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Backend error ${res.status}: ${text}`);
        }

        const data = await res.json();

        // Expect your backend to return { text: "..." }
        // If your backend returns { reply: "..." } you can adjust here.
        return data.text ?? data.reply ?? "";
    }



    async function onSend() {
        const text = input.trim();
        if (!text || isTyping || !activeThread) return;

        setInput("");
        setIsTyping(true);

        // Build the message list to send BEFORE state updates
        const outgoing = [
            ...(activeThread.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: text },
        ];

        // Optimistically add user message to UI
        addMessage("user", text);

        try {
            const answer = await callBackend(outgoing);
            addMessage("assistant", answer || "(empty response)");
        } catch (e: any) {
            addMessage("assistant", "⚠️ " + (e?.message ?? String(e)));
        } finally {
            setIsTyping(false);
            inputRef.current?.focus();
        }
    }


    return (
        <div className="cgpt-widget">
        <div className="cgpt-shell">
            {/* Sidebar */}
            <aside className="cgpt-sidebar">
    <div className="cgpt-side-top">
    <div className="cgpt-brand">Chat</div>
        <button className="cgpt-btn" onClick={newChat}>+ New</button>
        </div>

        <div className="cgpt-thread-list">
        {threads.map((t) => {
                const active = t.id === activeThread?.id;
                return (
                    <div
                        key={t.id}
                className={`cgpt-thread ${active ? "is-active" : ""}`}
                onClick={() => setActive(t.id)}
                role="button"
                tabIndex={0}
                >
                <div className="cgpt-thread-title">{t.title}</div>
                    <div className="cgpt-thread-meta">
                    <span>{formatDate(t.updatedAt)}</span>
                <button
                className="cgpt-link"
                onClick={(e) => { e.stopPropagation(); deleteChat(t.id); }}
                title="Delete"
                    >
                    Delete
                    </button>
                    </div>
                    </div>
            );
            })}
        </div>
        </aside>

    {/* Main */}
    <section className="cgpt-main">
    <header className="cgpt-main-top">
    <div className="cgpt-main-title">{activeThread?.title ?? "Chat"}</div>
    </header>

    <div className="cgpt-messages">
        {activeThread?.messages.map((m) => (
            <div key={m.id} className={`cgpt-row ${m.role === "user" ? "from-user" : "from-assistant"}`}>
    <div className="cgpt-bubble">
        <pre>{m.content}</pre>
        </div>
        </div>
))}

    {isTyping && (
        <div className="cgpt-row from-assistant">
        <div className="cgpt-bubble">
        <span className="cgpt-dots">
            <i /><i /><i />
            </span>
            </div>
            </div>
    )}

    <div ref={scrollRef} />
    </div>

    <footer className="cgpt-inputbar">
    <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
            }
        }}
        placeholder="Message… (Enter to send, Shift+Enter for newline)"
        rows={1}
    />
    <button className="cgpt-send" onClick={() => void onSend()} disabled={!input.trim() || isTyping}>
    Send
    </button>
    </footer>
    </section>
    </div>
    </div>
);
}
