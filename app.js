"use strict";

/*
=========================================================
JARVIS AI
Frontend controller
=========================================================
*/

const API = "/api";


const TOOLS = [
    {
        id: "chat",
        name: "JARVIS Chat",
        icon: "🤖"
    },
    {
        id: "search",
        name: "Web Search",
        icon: "🌐"
    },
    {
        id: "math",
        name: "Math Solver",
        icon: "🧮"
    },
    {
        id: "essay",
        name: "Essay Writer",
        icon: "📝"
    },
    {
        id: "translator",
        name: "Translator",
        icon: "🌍"
    },
    {
        id: "code",
        name: "Code Studio",
        icon: "💻"
    },
    {
        id: "debugger",
        name: "Debugger",
        icon: "🐞"
    },
    {
        id: "pdf",
        name: "PDF Reader",
        icon: "📄"
    },
    {
        id: "image",
        name: "Image Understanding",
        icon: "🖼️"
    },
    {
        id: "python",
        name: "Python Studio",
        icon: "🐍"
    },
    {
        id: "creative",
        name: "Creative AI",
        icon: "✨"
    },
    {
        id: "research",
        name: "Deep Research",
        icon: "🔬"
    }
];


const state = {
    activeTool: "chat",
    currentUser: null,
    conversationId: null,
    selectedFile: null,
    deferredInstallPrompt: null,
    voiceReplies: false
};


const $ = (id) => document.getElementById(id);


/*
=========================================================
INITIALIZATION
=========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    initialize
);


async function initialize() {

    renderTools();

    setupEvents();

    setupQuickPrompts();

    setupSpeechRecognition();

    registerServiceWorker();

    await checkServer();

    await loadCurrentUser();

    autoResizeTextarea();

}


/*
=========================================================
TOOLS
=========================================================
*/

function renderTools() {

    const container = $("toolsList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    TOOLS.forEach(tool => {

        const button =
            document.createElement("button");

        button.className =
            "tool-button";

        if (
            tool.id === state.activeTool
        ) {
            button.classList.add(
                "active"
            );
        }

        button.dataset.tool =
            tool.id;

        button.innerHTML = `
            <span class="tool-icon">
                ${tool.icon}
            </span>

            <span>
                ${escapeHtml(tool.name)}
            </span>
        `;

        button.addEventListener(
            "click",
            () => selectTool(tool.id)
        );

        container.appendChild(
            button
        );

    });
}


function selectTool(toolId) {

    const tool =
        TOOLS.find(
            item => item.id === toolId
        );

    if (!tool) {
        return;
    }

    state.activeTool =
        toolId;

    $("activeToolIcon")
        .textContent =
        tool.icon;

    $("activeToolName")
        .textContent =
        tool.name;

    renderTools();

    showToast(
        `${tool.name} selected`
    );
}


/*
=========================================================
EVENTS
=========================================================
*/

function setupEvents() {

    $("sendBtn")
        ?.addEventListener(
            "click",
            sendMessage
        );


    $("messageInput")
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();

                }

            }
        );


    $("messageInput")
        ?.addEventListener(
            "input",
            autoResizeTextarea
        );


    $("newChatBtn")
        ?.addEventListener(
            "click",
            newChat
        );


    $("historyBtn")
        ?.addEventListener(
            "click",
            openHistory
        );


    $("closeHistoryBtn")
        ?.addEventListener(
            "click",
            closeHistory
        );


    $("clearHistoryBtn")
        ?.addEventListener(
            "click",
            clearHistory
        );


    $("accountBtn")
        ?.addEventListener(
            "click",
            () => openModal(
                "accountModal"
            )
        );


    $("settingsBtn")
        ?.addEventListener(
            "click",
            () => openModal(
                "settingsModal"
            )
        );


    $("installBtn")
        ?.addEventListener(
            "click",
            () => openModal(
                "installModal"
            )
        );


    $("confirmInstallBtn")
        ?.addEventListener(
            "click",
            installPWA
        );


    $("attachBtn")
        ?.addEventListener(
            "click",
            () => $("fileInput").click()
        );


    $("fileInput")
        ?.addEventListener(
            "change",
            handleFile
        );


    $("removeAttachment")
        ?.addEventListener(
            "click",
            removeAttachment
        );


    $("authForm")
        ?.addEventListener(
            "submit",
            login
        );


    $("registerBtn")
        ?.addEventListener(
            "click",
            register
        );


    $("logoutBtn")
        ?.addEventListener(
            "click",
            logout
        );


    $("themeToggle")
        ?.addEventListener(
            "change",
            toggleTheme
        );


    $("voiceReplyToggle")
        ?.addEventListener(
            "change",
            event => {

                state.voiceReplies =
                    event.target.checked;

                localStorage.setItem(
                    "jarvis_voice_replies",
                    state.voiceReplies
                );

            }
        );


    document
        .querySelectorAll(
            "[data-close]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    closeModal(
                        button.dataset.close
                    );

                }
            );

        });


    window.addEventListener(
        "beforeinstallprompt",
        event => {

            event.preventDefault();

            state.deferredInstallPrompt =
                event;

        }
    );

}


/*
=========================================================
QUICK PROMPTS
=========================================================
*/

function setupQuickPrompts() {

    document
        .querySelectorAll(
            ".quick-prompt"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    $("messageInput")
                        .value =
                        button.dataset.prompt;

                    autoResizeTextarea();

                    sendMessage();

                }
            );

        });

}


/*
=========================================================
CHAT
=========================================================
*/

async function sendMessage() {

    const input =
        $("messageInput");

    const message =
        input.value.trim();

    if (!message) {
        return;
    }

    input.value = "";

    autoResizeTextarea();

    addUserMessage(message);

    showLoading(
        state.activeTool === "search"
            ? "Searching the live web..."
            : "JARVIS is thinking..."
    );

    try {

        const response =
            await fetch(
                `${API}/chat`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        message,
                        conversation_id:
                            state.conversationId,
                        tool:
                            state.activeTool
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "JARVIS request failed."
            );

        }


        if (
            data.conversation_id
        ) {

            state.conversationId =
                data.conversation_id;

        }


        addAssistantMessage(
            data.answer,
            data.sources,
            data.web_search_used
        );


        if (
            state.voiceReplies
        ) {

            speak(
                data.answer
            );

        }


        if (
            state.currentUser
        ) {

            loadHistory();

        }

    }
    catch (error) {

        console.error(error);

        addAssistantMessage(
            `I couldn't complete that request.\n\n${error.message}`
        );

    }
    finally {

        hideLoading();

    }

}


/*
=========================================================
MESSAGES
=========================================================
*/

function addUserMessage(
    message
) {

    hideWelcome();

    const chat =
        $("chat");

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "message user-message";

    wrapper.innerHTML = `
        <div class="message-bubble">
            ${formatText(message)}
        </div>
    `;

    chat.appendChild(
        wrapper
    );

    scrollChat();

}


function addAssistantMessage(
    message,
    sources = [],
    webSearchUsed = false
) {

    hideWelcome();

    const chat =
        $("chat");

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "message assistant-message";


    let sourcesHTML = "";


    if (
        Array.isArray(sources) &&
        sources.length > 0
    ) {

        sourcesHTML = `
            <div class="sources-box">

                <div class="sources-title">
                    <span>🌐</span>
                    Web Sources
                </div>

                ${sources
                    .map(source => `
                        <a
                            href="${escapeAttribute(source.url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="source-link"
                        >
                            ${escapeHtml(
                                source.title ||
                                source.url
                            )}
                        </a>
                    `)
                    .join("")}

            </div>
        `;

    }
    else if (
        webSearchUsed
    ) {

        sourcesHTML = `
            <div class="search-used">
                🌐 Live web search was used for this answer.
            </div>
        `;

    }


    wrapper.innerHTML = `
        <div class="assistant-avatar">
            🤖
        </div>

        <div class="assistant-content">

            <div class="message-bubble">
                ${formatText(message)}
            </div>

            ${sourcesHTML}

        </div>
    `;


    chat.appendChild(
        wrapper
    );

    scrollChat();

}


/*
=========================================================
NEW CHAT
=========================================================
*/

function newChat() {

    state.conversationId =
        null;

    $("chat").innerHTML = `
        <div id="welcome" class="welcome">

            <div class="welcome-icon">
                🤖
            </div>

            <h2>
                Hello, I'm JARVIS.
            </h2>

            <p>
                Real AI + real-time web search.
            </p>

        </div>
    `;

    setupQuickPrompts();

}


/*
=========================================================
HISTORY
=========================================================
*/

async function loadHistory() {

    if (!state.currentUser) {
        return;
    }

    try {

        const response =
            await fetch(
                `${API}/history`,
                {
                    credentials:
                        "include"
                }
            );


        if (!response.ok) {
            return;
        }


        const data =
            await response.json();


        const list =
            $("historyList");

        list.innerHTML = "";


        if (
            !data.conversations ||
            data.conversations.length === 0
        ) {

            list.innerHTML = `
                <div class="empty-history">
                    No saved conversations yet.
                </div>
            `;

            return;
        }


        data.conversations.forEach(
            conversation => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "history-item";

                button.textContent =
                    conversation.title;

                button.addEventListener(
                    "click",
                    () => loadConversation(
                        conversation.id
                    )
                );

                list.appendChild(
                    button
                );

            }
        );

    }
    catch (error) {

        console.error(
            "History error:",
            error
        );

    }

}


async function loadConversation(
    conversationId
) {

    try {

        const response =
            await fetch(
                `${API}/history/${conversationId}`,
                {
                    credentials:
                        "include"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Could not load conversation."
            );

        }


        state.conversationId =
            conversationId;


        $("chat").innerHTML = "";


        data.messages.forEach(
            message => {

                if (
                    message.role === "user"
                ) {

                    addUserMessage(
                        message.content
                    );

                }
                else {

                    addAssistantMessage(
                        message.content
                    );

                }

            }
        );


        closeHistory();

    }
    catch (error) {

        showToast(
            error.message
        );

    }

}


async function clearHistory() {

    if (!state.currentUser) {

        showToast(
            "Sign in first."
        );

        return;

    }


    const confirmed =
        confirm(
            "Delete all saved conversations?"
        );


    if (!confirmed) {
        return;
    }


    const response =
        await fetch(
            `${API}/history`,
            {
                method: "DELETE",
                credentials:
                    "include"
            }
        );


    if (response.ok) {

        state.conversationId =
            null;

        await loadHistory();

        newChat();

        showToast(
            "History cleared."
        );

    }

}


function openHistory() {

    $("historyPanel")
        ?.classList.add(
            "open"
        );

    loadHistory();

}


function closeHistory() {

    $("historyPanel")
        ?.classList.remove(
            "open"
        );

}


/*
=========================================================
AUTH
=========================================================
*/

async function loadCurrentUser() {

    try {

        const response =
            await fetch(
                `${API}/auth/me`,
                {
                    credentials:
                        "include"
                }
            );


        const data =
            await response.json();


        if (
            data.authenticated
        ) {

            state.currentUser =
                data.user;

        }
        else {

            state.currentUser =
                null;

        }


        updateAccountUI();

    }
    catch {

        state.currentUser =
            null;

        updateAccountUI();

    }

}


async function login(
    event
) {

    event.preventDefault();


    const email =
        $("emailInput")
            .value
            .trim();

    const password =
        $("passwordInput")
            .value;


    setAuthMessage(
        "Signing in..."
    );


    try {

        const response =
            await fetch(
                `${API}/auth/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials:
                        "include",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Login failed."
            );

        }


        state.currentUser =
            data.user;


        updateAccountUI();

        closeModal(
            "accountModal"
        );

        showToast(
            "Signed in successfully."
        );


        await loadHistory();

    }
    catch (error) {

        setAuthMessage(
            error.message
        );

    }

}


async function register() {

    const email =
        $("emailInput")
            .value
            .trim();

    const password =
        $("passwordInput")
            .value;


    if (!email || !password) {

        setAuthMessage(
            "Enter your email and password first."
        );

        return;

    }


    setAuthMessage(
        "Creating account..."
    );


    try {

        const response =
            await fetch(
                `${API}/auth/register`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials:
                        "include",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Registration failed."
            );

        }


        state.currentUser =
            data.user;


        updateAccountUI();

        closeModal(
            "accountModal"
        );

        showToast(
            "Account created."
        );

    }
    catch (error) {

        setAuthMessage(
            error.message
        );

    }

}


async function logout() {

    await fetch(
        `${API}/auth/logout`,
        {
            method: "POST",
            credentials:
                "include"
        }
    );


    state.currentUser =
        null;

    state.conversationId =
        null;

    updateAccountUI();

    closeModal(
        "accountModal"
    );

    newChat();

    showToast(
        "Signed out."
    );

}


function updateAccountUI() {

    const status =
        $("accountStatus");

    const logoutButton =
        $("logoutBtn");

    const authForm =
        $("authForm");

    const registerButton =
        $("registerBtn");


    if (
        state.currentUser
    ) {

        status.textContent =
            state.currentUser.email;

        logoutButton
            ?.classList.remove(
                "hidden"
            );

        authForm
            ?.classList.add(
                "hidden"
            );

        registerButton
            ?.classList.add(
                "hidden"
            );

        loadHistory();

    }
    else {

        status.textContent =
            "Guest Mode";

        logoutButton
            ?.classList.add(
                "hidden"
            );

        authForm
            ?.classList.remove(
                "hidden"
            );

        registerButton
            ?.classList.remove(
                "hidden"
            );

        const history =
            $("historyList");

        if (history) {

            history.innerHTML = `
                <div class="empty-history">
                    Sign in to save conversations across devices.
                </div>
            `;

        }

    }

}


/*
=========================================================
FILE ATTACHMENT
=========================================================
*/

function handleFile(event) {

    const file =
        event.target.files[0];

    if (!file) {
        return;
    }


    if (
        file.size >
        10 * 1024 * 1024
    ) {

        showToast(
            "Maximum file size is 10 MB."
        );

        event.target.value = "";

        return;

    }


    state.selectedFile =
        file;


    $("attachmentName")
        .textContent =
        file.name;


    $("attachmentPreview")
        .classList.remove(
            "hidden"
        );

}


function removeAttachment() {

    state.selectedFile =
        null;

    $("fileInput")
        .value = "";

    $("attachmentPreview")
        .classList.add(
            "hidden"
        );

}


/*
=========================================================
VOICE
=========================================================
*/

let recognition = null;


function setupSpeechRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

        $("voiceBtn")
            ?.classList.add(
                "disabled"
            );

        return;

    }


    recognition =
        new SpeechRecognition();

    recognition.lang =
        "en-US";

    recognition.interimResults =
        false;

    recognition.continuous =
        false;


    recognition.onresult =
        event => {

            const text =
                event.results[0][0]
                    .transcript;

            $("messageInput")
                .value =
                text;

            autoResizeTextarea();

        };


    recognition.onerror =
        () => {

            showToast(
                "Voice input failed."
            );

        };


    $("voiceBtn")
        ?.addEventListener(
            "click",
            () => {

                try {

                    recognition.start();

                    showToast(
                        "Listening..."
                    );

                }
                catch {}

            }
        );

}


function speak(text) {

    if (
        !window.speechSynthesis
    ) {
        return;
    }

    window.speechSynthesis.cancel();

    const utterance =
        new SpeechSynthesisUtterance(
            text
        );

    utterance.rate =
        1;

    utterance.pitch =
        1;

    window.speechSynthesis.speak(
        utterance
    );

}


/*
=========================================================
PWA
=========================================================
*/

function registerServiceWorker() {

    if (
        "serviceWorker" in navigator
    ) {

        navigator.serviceWorker
            .register(
                "./sw.js"
            )
            .catch(
                console.error
            );

    }

}


async function installPWA() {

    if (
        !state.deferredInstallPrompt
    ) {

        showToast(
            "Your browser does not currently offer installation."
        );

        return;

    }


    state.deferredInstallPrompt
        .prompt();


    await state.deferredInstallPrompt
        .userChoice;


    state.deferredInstallPrompt =
        null;

    closeModal(
        "installModal"
    );

}


/*
=========================================================
SERVER
=========================================================
*/

async function checkServer() {

    try {

        const response =
            await fetch(
                `${API}/health`
            );


        const data =
            await response.json();


        if (
            data.status === "online"
        ) {

            $("connectionStatus")
                .innerHTML = `
                    <span class="status-dot online"></span>
                    JARVIS Online
                `;

        }

    }
    catch {

        $("connectionStatus")
            .innerHTML = `
                <span class="status-dot offline"></span>
                Backend Offline
            `;

    }

}


/*
=========================================================
UI
=========================================================
*/

function showLoading(
    text
) {

    $("loadingText")
        .textContent =
        text;

    $("loadingOverlay")
        .classList.remove(
            "hidden"
        );

}


function hideLoading() {

    $("loadingOverlay")
        .classList.add(
            "hidden"
        );

}


function hideWelcome() {

    $("welcome")
        ?.remove();

}


function scrollChat() {

    const chat =
        $("chat");

    chat.scrollTop =
        chat.scrollHeight;

}


function autoResizeTextarea() {

    const textarea =
        $("messageInput");

    if (!textarea) {
        return;
    }

    textarea.style.height =
        "auto";

    textarea.style.height =
        Math.min(
            textarea.scrollHeight,
            180
        ) + "px";

}


/*
=========================================================
MODALS
=========================================================
*/

function openModal(
    id
) {

    $(id)
        ?.classList.remove(
            "hidden"
        );

}


function closeModal(
    id
) {

    $(id)
        ?.classList.add(
            "hidden"
        );

}


function setAuthMessage(
    message
) {

    $("authMessage")
        .textContent =
        message;

}


/*
=========================================================
THEME
=========================================================
*/

function toggleTheme(
    event
) {

    document.body
        .classList.toggle(
            "light-mode",
            event.target.checked
        );

}


/*
=========================================================
TOAST
=========================================================
*/

let toastTimer;


function showToast(
    message
) {

    const toast =
        $("toast");

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}


/*
=========================================================
FORMATTING / SECURITY
=========================================================
*/

function escapeHtml(
    value
) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


function escapeAttribute(
    value
) {

    return escapeHtml(
        value
    );

}


function formatText(
    value
) {

    let text =
        escapeHtml(
            value
        );


    text =
        text.replace(
            /```([\s\S]*?)```/g,
            "<pre><code>$1</code></pre>"
        );


    text =
        text.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );


    text =
        text.replace(
            /`([^`]+)`/g,
            "<code>$1</code>"
        );


    text =
        text.replace(
            /\n/g,
            "<br>"
        );


    return text;

}
