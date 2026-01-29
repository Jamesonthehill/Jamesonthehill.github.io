import React from "react";
import { createRoot } from "react-dom/client";
import ChatGPTWidget from "./ChatGPTWidget";
import "./widget.css";

let root: ReturnType<typeof createRoot> | null = null;

function mount(selector = "#chat-root") {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Mount element not found: ${selector}`);

    if (root) root.unmount();
    root = createRoot(el);
    root.render(<ChatGPTWidget />);
}

function unmount() {
    if (root) root.unmount();
    root = null;
}

// ✅ THIS is what makes window.ChatWidget exist
(window as any).ChatWidget = { mount, unmount };
