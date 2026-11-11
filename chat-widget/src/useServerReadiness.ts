import { useCallback, useEffect, useRef, useState } from "react";
// @ts-expect-error The small health polling helper is shared with Node tests.
import { waitForServer } from "./server-readiness.mjs";

export function useServerReadiness(backendUrl: string) {
    const [status, setStatus] = useState<"idle" | "checking" | "ready" | "error">("idle");
    const [slow, setSlow] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const start = useCallback(async () => {
        if (controller.current) return;
        const abort = new AbortController(); controller.current = abort;
        setStatus("checking"); setSlow(false);
        const notice = window.setTimeout(() => {if (!abort.signal.aborted) setSlow(true);}, 10000);
        try {
            const base = new URL(backendUrl, window.location.href);
            await waitForServer(new URL("/health", base).toString(), {signal:abort.signal});
            if (!abort.signal.aborted) setStatus("ready");
        } catch {
            if (!abort.signal.aborted) setStatus("error");
        } finally {
            window.clearTimeout(notice);
            if (controller.current === abort) controller.current = null;
        }
    }, [backendUrl]);
    useEffect(() => () => controller.current?.abort(), []);
    return { status, slow, start };
}
