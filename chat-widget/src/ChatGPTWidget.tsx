import React, { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; content: string; createdAt: number };

type Thread = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: Msg[];
    learningTopic?: string;
    engineState?: Record<string, unknown>;
};

type SocraticResponse = {
    answer: string;
    conversation_id: string;
    learning_topic: string;
    socratic: Record<string, unknown>;
};

function isSocraticResponse(value: unknown): value is SocraticResponse {
    if (!value || typeof value !== "object") return false;
    const response = value as Record<string, unknown>;
    return (
        typeof response.answer === "string" &&
        typeof response.conversation_id === "string" &&
        typeof response.learning_topic === "string" &&
        !!response.socratic &&
        typeof response.socratic === "object"
    );
}

const STORAGE_KEY = "socratic_widget_threads_v1";
const WELCOME_MESSAGE =
    "Choose something you want to understand. I’ll guide your thinking with one focused question at a time rather than simply giving you an answer.";
const NEW_THREAD_TITLE = "Learning question";
const SUGGESTED_QUESTIONS = [
    "What experience does Geonwoo have with RAG and AI systems?",
    "What did Geonwoo work on during his EPRI internship?",
    "Which projects demonstrate Geonwoo’s software engineering skills?",
    "How has Geonwoo combined AI research with full-stack development?",
];
const THINKING_NOTES = [
    "Reading your question",
    "Tracing the key idea",
    "Shaping the next question",
];

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

function formatElapsed(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function thinkingNote(seconds: number) {
    return THINKING_NOTES[Math.floor(seconds / 4) % THINKING_NOTES.length];
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
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
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

    useEffect(() => {
        if (!isTyping) return;
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [isTyping]);

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

    async function callBackend(thread: Thread, nextMessages: { role: Role; content: string }[]) {
        if (!backendUrl) throw new Error("backendUrl is empty. Pass it from mount().");
        const latest = nextMessages[nextMessages.length - 1];

        const res = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                conversation_id: thread.id,
                message: latest.content,
                history: nextMessages.slice(0, -1).slice(-12),
                learning_topic: thread.learningTopic,
                engine_state: thread.engineState ?? {},
            }),
        });

        if (!res.ok) throw new Error("The assistant is temporarily unavailable.");

        const data: unknown = await res.json();
        if (!isSocraticResponse(data)) {
            throw new Error("The Socratic service returned an invalid response.");
        }
        return data;
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

        setElapsedSeconds(0);
        setIsTyping(true);

        try {
            const result = await callBackend(activeThread, outgoing);
            updateThread(activeThread.id, (thread) => ({
                ...thread,
                learningTopic: result.learning_topic,
                engineState: result.socratic,
                updatedAt: now(),
            }));
            addMessage("assistant", result.answer || "(empty response)");
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
                        <a className="cgpt-brand" href="/" aria-label="Socratic Questioning Lab">
                            <span className="cgpt-brand-mark">SQ</span>
                            <span><strong>Socratic Lab</strong><small>Questioning tutor</small></span>
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
                        <span className="cgpt-status-dot" /> Adaptive guided questions
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
                                <div className="cgpt-orbit" aria-hidden="true"><span>SQ</span><i>✦</i></div>
                                <span className="cgpt-welcome-label">SOCRATIC LEARNING AI</span>
                                <h1>Think it through,<br /><em>one question at a time.</em></h1>
                                <p>Choose a topic and build your understanding through adaptive guided questions.</p>
                                <div className="cgpt-prompt-grid" aria-label="Suggested learning questions">
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
                                {message.role === "assistant" && <span className="cgpt-message-avatar">SQ</span>}
                                <div className="cgpt-message-wrap">
                                    <span className="cgpt-message-meta">{message.role === "user" ? "You" : "Socratic Tutor"} · {formatTime(message.createdAt)}</span>
                                    <div className="cgpt-bubble"><pre>{message.content}</pre></div>
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="cgpt-row from-assistant">
                                <span className="cgpt-message-avatar">SQ</span>
                                <div className="cgpt-message-wrap">
                                    <span className="cgpt-message-meta" aria-live="polite">
                                        Socratic Tutor · Answering · {formatElapsed(elapsedSeconds)}
                                    </span>
                                    <div className="cgpt-bubble cgpt-thinking-bubble">
                                        <span className="cgpt-thinking-orbit" aria-hidden="true">
                                            <b>?</b><i /><i /><i />
                                        </span>
                                        <span className="cgpt-thinking-copy">
                                            {thinkingNote(elapsedSeconds)}
                                            <small>Thinking with you</small>
                                        </span>
                                    </div>
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
                                placeholder="What would you like to understand?"
                                rows={1}
                                aria-label="Ask the Socratic tutor"
                            />
                            <button className="cgpt-send" onClick={() => void onSend()} disabled={!input.trim() || isTyping} aria-label="Send question">
                                <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                        <p>Guided by your reasoning · AI may make mistakes</p>
                    </footer>
                </section>
            </div>
        </div>
    );
}
