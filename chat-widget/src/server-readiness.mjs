// Health checks wake the web service without running document preparation or an AI model.
export async function waitForServer(url, {
    signal,
    timeoutMs = 90000,
    requestTimeoutMs = 15000,
    pollMs = 3000,
    fetcher = fetch,
} = {}) {
    const deadline = Date.now() + timeoutMs;
    const aborted = () => new DOMException("Connection check cancelled.", "AbortError");
    while (Date.now() < deadline) {
        if (signal?.aborted) throw aborted();
        const request = new AbortController();
        const cancel = () => request.abort();
        signal?.addEventListener("abort", cancel, {once:true});
        const timer = setTimeout(cancel, Math.min(requestTimeoutMs, Math.max(1, deadline-Date.now())));
        try {
            const response = await fetcher(url, {signal:request.signal, cache:"no-store", headers:{Accept:"application/json"}});
            if (response.ok) {
                // Render can serve a 200 HTML wake-up page before the app itself is ready.
                const body = await response.json();
                if (body?.status === "ok") return;
            }
        } catch {
            if (signal?.aborted) throw aborted();
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
        }
        if (Date.now() >= deadline) break;
        await new Promise((resolve,reject) => {
            const stop = () => { clearTimeout(timer); reject(aborted()); };
            const timer = setTimeout(() => {signal?.removeEventListener("abort",stop);resolve();}, Math.min(pollMs,deadline-Date.now()));
            signal?.addEventListener("abort",stop,{once:true});
            if (signal?.aborted) stop();
        });
    }
    throw new Error("The server is taking longer than expected. Please retry the connection.");
}
