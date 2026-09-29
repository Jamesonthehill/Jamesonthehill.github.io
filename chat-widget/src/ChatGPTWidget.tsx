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
    "Hi, I'm Geonwoo's resume assistant. Ask me about his projects, interests, experience, education, or contact information. If this is your first question, please allow about 15 seconds for the server to wake up.";
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

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

        if (!res.ok) throw new Error("The assistant is temporarily unavailable.");

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
        } catch {
            addMessage("assistant", "I’m having trouble connecting right now. Please try again in a moment.");
        } finally {
            setIsTyping(false);
            inputRef.current?.focus();
        }
    }


    const isFresh = (activeThread?.messages.length ?? 0) <= 1;
    const visibleMessages = isFresh
        ? []
        : activeThread?.messages.filter((message) => message.content !== WELCOME_MESSAGE) ?? [];

    return (
        <div className="cgpt-widget">
            <div className="cgpt-shell">
                <aside className="cgpt-sidebar" aria-label="Conversation history">
                    <div className="cgpt-brand-block">
                        <a className="cgpt-brand" href="/" aria-label="Geonwoo Lee home">
                            <span className="cgpt-brand-mark">GL</span>
                            <span><strong>Geonwoo AI</strong><small>Portfolio assistant</small></span>
                        </a>
                        <button className="cgpt-new" onClick={newChat}>
                            <span aria-hidden="true">＋</span> New conversation
                        </button>
                    </div>
                    <div className="cgpt-history-label">Recent conversations</div>
                    <div className="cgpt-thread-list">
                        {threads.map((thread) => {
                            const active = thread.id === activeThread?.id;
                            return (
                                <div
                                    key={thread.id}
                                    className={`cgpt-thread ${active ? "is-active" : ""}`}
                                    onClick={() => setActive(thread.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") setActive(thread.id);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <span className="cgpt-thread-icon" aria-hidden="true">↗</span>
                                    <span className="cgpt-thread-copy">
                                        <span className="cgpt-thread-title">{thread.title}</span>
                                        <span className="cgpt-thread-date">{formatDate(thread.updatedAt)}</span>
                                    </span>
                                    <button
                                        className="cgpt-delete"
                                        onClick={(event) => { event.stopPropagation(); deleteChat(thread.id); }}
                                        title="Delete conversation"
                                        aria-label={`Delete ${thread.title}`}
                                    >×</button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="cgpt-side-note">
                        <span className="cgpt-status-dot" /> Resume-grounded answers
                    </div>
                </aside>

                <section className="cgpt-main">
                    <header className="cgpt-main-top">
                        <div>
                            <div className="cgpt-main-title">{activeThread?.title ?? NEW_THREAD_TITLE}</div>
                        </div>
                        <div className="cgpt-header-actions">
                            <span className="cgpt-online"><i /> Online</span>
                            <button className="cgpt-mobile-new" onClick={newChat} aria-label="New conversation">＋</button>
                        </div>
                    </header>

                    <div className={`cgpt-messages ${isFresh ? "is-fresh" : ""}`}>
                        {isFresh && (
                            <div className="cgpt-welcome">
                                <div className="cgpt-orbit" aria-hidden="true"><span>GL</span><i>✦</i></div>
                                <span className="cgpt-welcome-label">RESUME-POWERED AI</span>
                                <h1>Ask me about<br /><em>Geonwoo’s work.</em></h1>
                                <p>I can help you explore his research, engineering experience, projects, and background.</p>
                                <div className="cgpt-prompt-grid" aria-label="Suggested resume questions">
                                    {SUGGESTED_QUESTIONS.slice(0, 2).map((question, index) => (
                                        <button key={question} type="button" onClick={() => void onSend(question)} disabled={isTyping}>
                                            <span className="cgpt-prompt-number">0{index + 1}</span>
                                            <span>{question}</span>
                                            <b aria-hidden="true">↗</b>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibleMessages.map((message) => (
                            <div key={message.id} className={`cgpt-row ${message.role === "user" ? "from-user" : "from-assistant"}`}>
                                {message.role === "assistant" && <span className="cgpt-message-avatar">GL</span>}
                                <div className="cgpt-message-wrap">
                                    <span className="cgpt-message-meta">{message.role === "user" ? "You" : "Geonwoo AI"} · {formatTime(message.createdAt)}</span>
                                    <div className="cgpt-bubble"><pre>{message.content}</pre></div>
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="cgpt-row from-assistant">
                                <span className="cgpt-message-avatar">GL</span>
                                <div className="cgpt-message-wrap">
                                    <span className="cgpt-message-meta">Geonwoo AI · thinking</span>
                                    <div className="cgpt-bubble"><span className="cgpt-dots"><i /><i /><i /></span></div>
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>

                    <footer className="cgpt-composer-wrap">
                        <div className="cgpt-inputbar">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void onSend();
                                    }
                                }}
                                placeholder="Ask about research, projects, or experience…"
                                rows={1}
                                aria-label="Ask Geonwoo AI"
                            />
                            <button className="cgpt-send" onClick={() => void onSend()} disabled={!input.trim() || isTyping} aria-label="Send question">
                                <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                        <p>Grounded in Geonwoo’s résumé · AI may make mistakes</p>
                    </footer>
                </section>
            </div>
        </div>
    );
}
