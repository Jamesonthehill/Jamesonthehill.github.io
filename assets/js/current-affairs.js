const ENDPOINT = "https://chatbot-backend-zto2.onrender.com/api/current-affairs";
const NEWS_SEARCH = {
    world: "https://news.google.com/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRGx1YlY4U0JXVnVMVlZUR2dKVlV5Z0FQAQ?hl=en-US&gl=US&ceid=US%3Aen",
    us: "https://news.google.com/search?q=United%20States%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen",
    kr: "https://news.google.com/search?q=%22South%20Korea%22%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen",
};
const buttons = [...document.querySelectorAll(".current-affairs-regions button")];
const refresh = document.querySelector("#current-affairs-refresh");
const status = document.querySelector(".current-affairs-status");
const fallback = document.querySelector(".current-affairs-external");
const stories = document.querySelector(".current-affairs-stories");
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
let selected = buttons[0];
let request;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function timestamp(value) {
    const time = element("time");
    if (Number.isFinite(Date.parse(value))) {
        time.dateTime = value;
        time.textContent = dateFormat.format(new Date(value));
    }
    return time;
}

function storyCard(article) {
    const url = new URL(article.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const card = element("li");
    const metadata = element("div", "", "current-affairs-story-meta");
    metadata.append(element("strong", article.source), timestamp(article.published_at));
    const title = element("h2");
    const link = element("a", article.title);
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    title.append(link);
    card.append(metadata, title);
    if (article.summary || article.description) card.append(element("p", article.summary || article.description));
    return card;
}

async function load(button, force = false) {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const timer = window.setTimeout(() => controller.abort(), 70_000);
    if (button !== selected) stories.replaceChildren();
    selected = button;

    const region = button.dataset.region;
    const name = button.textContent;
    for (const option of buttons) option.setAttribute("aria-pressed", String(option === selected));
    stories.setAttribute("aria-label", `${name} headlines`);
    refresh.disabled = true;
    status.textContent = `Searching ${name} headlines…`;
    fallback.href = NEWS_SEARCH[region];
    fallback.textContent = `Browse ${name} headlines on Google News ↗`;
    fallback.hidden = true;

    try {
        const url = new URL(ENDPOINT);
        url.searchParams.set("region", region);
        if (force) url.searchParams.set("refresh", "1");
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
        if (request !== controller) return;
        if (!response.ok) {
            if (data.code === "news_not_configured") {
                status.textContent = "The in-page headline feed is awaiting setup.";
                fallback.hidden = false;
                return;
            }
            throw new Error("News service unavailable");
        }
        const cards = data.articles.map(storyCard).filter(Boolean);
        stories.replaceChildren(...cards);
        if (cards.length) {
            status.replaceChildren(data.stale ? "Showing the last available edition · " : "Feed checked ",
                timestamp(data.generated_at));
        } else {
            status.textContent = "No recent English-language headlines found for this region.";
            fallback.hidden = false;
        }
    } catch {
        if (request === controller) {
            status.textContent = "Couldn’t load headlines. Try refreshing in a moment.";
            fallback.hidden = false;
        }
    } finally {
        window.clearTimeout(timer);
        if (request === controller) refresh.disabled = false;
    }
}

for (const button of buttons) {
    button.addEventListener("click", () => { if (button !== selected) void load(button); });
}
refresh.addEventListener("click", () => void load(selected, true));
void load(selected);
