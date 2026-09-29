(function () {
  "use strict";

  var chatToggle = document.getElementById("chat-toggle");
  var chatWidget = document.getElementById("chat-widget");
  var chat = document.getElementById("chat");
  var form = document.getElementById("form");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("send-btn");
  var closeBtn = document.getElementById("chat-close");
  var newBtn = document.getElementById("chat-new");
  var welcome = chat && chat.querySelector(".chat-welcome");
  var conversation = [];
  var threadId = null;

  if (!chatToggle || !chatWidget || !chat || !form || !input || !sendBtn || !closeBtn || !newBtn || !welcome) return;

  function setOpen(open) {
    chatWidget.classList.toggle("is-open", open);
    chatWidget.setAttribute("aria-hidden", String(!open));
    chatToggle.setAttribute("aria-expanded", String(open));
    if (open) window.setTimeout(function () { input.focus(); }, 80);
  }

  chatToggle.addEventListener("click", function () {
    setOpen(!chatWidget.classList.contains("is-open"));
  });
  closeBtn.addEventListener("click", function () { setOpen(false); });

  newBtn.addEventListener("click", function () {
    conversation.length = 0;
    threadId = null;
    chat.querySelectorAll(".msg").forEach(function (message) { message.remove(); });
    welcome.hidden = false;
    input.focus();
  });

  function addMessage(text, sender) {
    var div = document.createElement("div");
    var bubble = document.createElement("span");
    div.className = "msg " + sender;
    bubble.textContent = text;
    div.appendChild(bubble);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function addThinking() {
    var div = document.createElement("div");
    div.className = "msg bot thinking";
    div.setAttribute("aria-label", "Assistant is thinking");
    div.innerHTML = "<span><i></i><i></i><i></i></span>";
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 92) + "px";
    sendBtn.disabled = !input.value.trim();
  }

  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.querySelectorAll(".chat-suggestion").forEach(function (button) {
    button.addEventListener("click", function () {
      input.value = button.textContent;
      resizeInput();
      form.requestSubmit();
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;

    welcome.hidden = true;
    addMessage(text, "user");
    conversation.push({ role: "user", content: text });
    input.value = "";
    resizeInput();
    input.focus();

    var thinking = addThinking();
    sendBtn.disabled = true;

    try {
      var response = await fetch("https://chatbot-backend-zto2.onrender.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: threadId, messages: conversation }),
      });
      if (!response.ok) throw new Error("The assistant is temporarily unavailable.");
      var data = await response.json();
      thinking.remove();
      if (data.reply) {
        threadId = data.threadId || threadId;
        conversation.push({ role: "assistant", content: data.reply });
        addMessage(data.reply, "bot");
      } else {
        addMessage("I couldn’t answer that just now. Please try again in a moment.", "bot");
      }
    } catch (err) {
      thinking.remove();
      addMessage("I’m having trouble connecting right now. Please try again in a moment.", "bot");
    } finally {
      sendBtn.disabled = !input.value.trim();
    }
  });
})();
