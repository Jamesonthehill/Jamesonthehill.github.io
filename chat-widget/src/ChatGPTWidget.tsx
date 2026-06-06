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
const WELCOME_MESSAGE =
    "Hi, I'm Geonwoo's resume assistant. Ask me about his projects, skills, experience, education, or contact information.";
const NEW_THREAD_TITLE = "Resume question";
const SUGGESTED_QUESTIONS = [
    "What projects has Geonwoo built?",
    "What are Geonwoo's technical interests?",
    "Does Geonwoo have research experience?",
    "Tell me about Geonwoo's education.",
    "How can I contact Geonwoo?",
];
const CONTACT_QUESTION = "How can I contact Geonwoo?";
const CONTACT_ANSWER = "You can contact Geonwoo at dlrjsdn5333@gmail.com or 7042581759.";

function uid() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (
            Number(c) ^
            (Math.random() * 16) >>
                (Number(c) / 4)
        ).toString(16)
    );
}

function isUuid(value: unknown) {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

function now() {
    return Date.now();
}

function safeLoad(): Thread[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.map((thread) => ({
            ...thread,
            id: isUuid(thread.id) ? thread.id : uid(),
            title: thread.title === "New chat" ? NEW_THREAD_TITLE : thread.title,
            messages: Array.isArray(thread.messages)
                ? thread.messages.map((message: Msg) => ({
                      ...message,
                      content:
                          message.role === "assistant" &&
                          (message.content === "Hi! Start a new chat on the left." ||
                              message.content === "What's on your mind?" ||
                              message.content === "What’s on your mind?" ||
                              message.content === "New chat started.")
                              ? WELCOME_MESSAGE
                              : message.content,
                  }))
                : [],
        }));
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

        const t: Thread = {
            id: uid(),
            title: NEW_THREAD_TITLE,
            createdAt: now(),
            updatedAt: now(),
            messages: [
                { id: uid(), role: "assistant", content: WELCOME_MESSAGE, createdAt: now() },
            ],
        };
        return [t];
    });

    const [activeId, setActiveId] = useState("");

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
            title: NEW_THREAD_TITLE,
            createdAt: now(),
            updatedAt: now(),
            messages: [{ id: uid(), role: "assistant", content: WELCOME_MESSAGE, createdAt: now() }],
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
                    title: NEW_THREAD_TITLE,
                    createdAt: now(),
                    updatedAt: now(),
                    messages: [{ id: uid(), role: "assistant", content: WELCOME_MESSAGE, createdAt: now() }],
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
                t.title === NEW_THREAD_TITLE && role === "user"
                    ? content.trim().slice(0, 32) || NEW_THREAD_TITLE
                    : t.title;

            return {
                ...t,
                title: nextTitle,
                messages: nextMessages,
                updatedAt: now(),
            };
        });
    }

    async function callBackend(threadId: string, nextMessages: ({ role: "user" | "assistant"; content: string } | {
        role: string;
        content: string
    })[]) {
        if (!backendUrl) throw new Error("backendUrl is empty. Pass it from mount().");

        const res = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                threadId,            // ✅ add this
                messages: nextMessages,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Backend error ${res.status}: ${text}`);
        }

        const data = await res.json();
        return data.reply ?? data.text ?? "";
    }
    async function onSend(prompt?: string) {
        const text = (prompt ?? input).trim();
        if (!text || isTyping || !activeThread) return;

        setInput("");

        // Build the message list to send BEFORE state updates
        const outgoing = [
            ...(activeThread.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: text },
        ];

        // Optimistically add user message to UI
        addMessage("user", text);

        if (text === CONTACT_QUESTION) {
            addMessage("assistant", CONTACT_ANSWER);
            inputRef.current?.focus();
            return;
        }

        setIsTyping(true);

        try {
            const answer = await callBackend(activeThread.id, outgoing);
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
    <div className="cgpt-brand">Geonwoo Resume Assistant</div>
        <button className="cgpt-btn" onClick={newChat}>New question</button>
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
    <div className="cgpt-main-title">{activeThread?.title ?? NEW_THREAD_TITLE}</div>
    <p className="cgpt-main-subtitle">
        Ask about Geonwoo's background, projects, skills, education, and experience.
    </p>
    <div className="cgpt-suggestions" aria-label="Suggested resume questions">
        {SUGGESTED_QUESTIONS.map((question) => (
            <button
                key={question}
                type="button"
                className="cgpt-suggestion"
                onClick={() => void onSend(question)}
                disabled={isTyping}
            >
                {question}
            </button>
        ))}
    </div>
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
        placeholder="Ask about Geonwoo's resume..."
        rows={1}
    />
    <button className="cgpt-send" onClick={() => void onSend()} disabled={!input.trim() || isTyping}>
    Ask
    </button>
    </footer>
    </section>
    </div>
    </div>
);
}
