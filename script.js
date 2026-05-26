import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwISHyAXQZVix0RgQbCgTJU00AKBsi8DXqIqWevop52kcKkrN5EqxO2qEwSNWeeezG5fQ/exec";

const firebaseConfig = {
  apiKey: "AIzaSyAdO6wshzd4sSjQSl_kGKtelSdseqLRDm8",
  authDomain: "itm-counselor.firebaseapp.com",
  projectId: "itm-counselor",
  storageBucket: "itm-counselor.firebasestorage.app",
  messagingSenderId: "11295448645",
  appId: "1:11295448645:web:5beb10578498e8117bcd2c",
  measurementId: "G-WJELKGVRZ0",
};

const ALLOWED_EMAIL_DOMAIN = "@itm.edu";

const buckets = [
  {
    bucket: "Fresh & Untouched (Google Ads first)",
    subStages: "Untouched -> Fresh Lead | Filter: Publisher = Google Ads first, then organic",
  },
  {
    bucket: "Secondary / Reassigned Fresh",
    subStages: "Secondary Fresh • Tertiary Fresh • Reassigned Fresh",
  },
  {
    bucket: "Application Initiated + Will Apply",
    subStages: "Interested & Eligible -> Hot - Application Initiated • Hot - Will Apply",
  },
  {
    bucket: "Telephonic Counseling + Campus Visit",
    subStages:
      "Interested & Eligible -> Hot - Telephonic Counseling Done • Hot - Will Visit Campus • Hot - Workshop/Webinar Attended • Hot - Will Attend Workshop/Webinar • Hot - Will Take Counselling • Other Interest (Walked In/Visited)",
  },
  {
    bucket: "Hot & Warm Follow Ups",
    subStages: "Interested & Eligible -> Hot - Follow Up • Warm - Follow Up • Not Responding",
  },
  {
    bucket: "Scheduled Callback / Busy Leads",
    subStages: "Call Back -> Interested but Busy, Call Back • Scheduled Callback",
  },
  {
    bucket: "Follow Up 1-5 Closure Attempts",
    subStages: "Follow Up -> FU-1 • FU-2 • FU-3 • FU-4 • FU-5 • Dead Follow Up",
  },
  {
    bucket: "NC-1 to NC-5 Retry + WhatsApp",
    subStages: "Not Connected -> NC-1 • NC-2 • NC-3 (+ WhatsApp) • NC-4 (+ WhatsApp) • NC-5 (final WhatsApp)",
  },
  {
    bucket: "Unpaid Application Closure",
    subStages:
      "Form Submitted -> Hot • Warm • NA | Payment Status = Payment Pending | Application Stage = Untouched / Application Started",
  },
  {
    bucket: "Entrance Test + Interview",
    subStages: "Closed Won -> Application Submitted • Test Completed • Interview Completed • Offer Letter Issued • Fees Paid",
  },
  {
    bucket: "Waitlisted SRF Calls",
    subStages:
      "Closed Won -> Offer Letter Issued (SRF Pending) | Application Stage = B.Tech Offer Letter with/without Scholarship | Push immediate SRF payment • Confirm scholarship offer • Lock seat before deadline",
  },
  {
    bucket: "SMS / WhatsApp Broadcast",
    subStages:
      "Bulk SMS to unresponsive • Follow-up SMS to 'Read - No Reply' • Personalised WhatsApp for NC-3+ • Include 35-yr ITM legacy + scholarship hook",
  },
  {
    bucket: "Check Important things from OverDue",
    subStages: "Call Back -> the Most important Overdue leads",
  },
  {
    bucket: "Final Untouched Sweep Before Logoff",
    subStages:
      "Untouched -> Fresh Lead (new arrivals during shift) • Secondary Fresh (new) | ZERO pending Untouched at logoff",
  },
];

const toast = document.querySelector("#toast");
const chatLog = document.querySelector("#chatLog");
const chatInput = document.querySelector("#chatInput");
const sendButton = document.querySelector("#sendButton");
const quickRepliesEl = document.querySelector("#quickReplies");
const restartButton = document.querySelector("#restartButton");
const backButton = document.querySelector("#backButton");
const authGate = document.querySelector("#authGate");
const googleSignInButton = document.querySelector("#googleSignInButton");
const authError = document.querySelector("#authError");

function currentDateISO() {
  // Always use India date (Asia/Kolkata), not the user's local machine TZ or UTC.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

// Intentionally no visible "sheet ready" status pill in the UI.
wireBrandFallback();
lockUIForAuth();
initAuth();

// --- Conversation state ---
const state = {
  // shift
  entryDate: currentDateISO(),
  counsellorName: "",
  teamName: "",
  managerName: "",
  // kpis
  totalCalls: 0,
  connectedCalls: 0,
  applications: 0,
  srfs: 0,
  talktimeMinutes: 0,
  // crm actions
  otpVerified: "No",
  whatsappSent: "No",
  crmNoteAdded: "No",
  leadStageMoved: "No",
  followUpSet: "No",
  // buckets
  selectedBucketIndexes: new Set(),
  bucketCounts: new Map(), // index -> {calls, connected, apps, srf}
  // comments
  comments: "",
};

// Keep snapshots so Back goes to the previous question reliably (including dynamic prompts).
// Each entry: { promptIndex, stateSnapshot }
const history = [];

let promptIndex = 0;
let awaitingCustomUI = null; // {type: "bucket_select"} etc.
let conversationStarted = false;

const prompts = [
  {
    key: "counsellorName",
    ask: () => "Counsellor name?",
    placeholder: "e.g. Swapnil",
    parse: (raw) => {
      const v = (raw || "").trim();
      if (!v) return { error: "Please enter counsellor name." };
      return v;
    },
  },
  {
    key: "teamName",
    ask: () => "Team name?",
    placeholder: "Select a team",
    quickReplies: ["BTech", "BBA", "MCA", "MBA Applied AI", "MBA iConnect"],
    parse: (raw) => {
      const v = (raw || "").trim();
      if (!v) return { error: "Please choose a team name." };
      const allowed = new Set(["BTech", "BBA", "MCA", "MBA Applied AI", "MBA iConnect"]);
      if (!allowed.has(v)) return { error: "Please choose from the given options." };
      return v;
    },
  },
  {
    key: "managerName",
    ask: () => "Manager name? (optional)",
    placeholder: "e.g. Manager Name",
    parse: (raw) => (raw || "").trim(),
  },
  {
    key: "bucketSelect",
    ask: () => "Which execution buckets did you work on today? Select all that apply, then press Done.",
    customUI: "bucket_select",
  },
  // For each selected bucket we dynamically insert 4 numeric prompts.
  // Then KPI prompts (overall totals).
  {
    key: "totalCalls",
    ask: () => "Total calls (overall for the day)?",
    placeholder: "0",
    quickReplies: ["0", "150"],
    parse: parseNonNegativeInt,
  },
  {
    key: "connectedCalls",
    ask: () => "Connected calls (overall)?",
    placeholder: "0",
    quickReplies: ["0", "60"],
    parse: parseNonNegativeInt,
  },
  {
    key: "applications",
    ask: () => "Applications (overall)?",
    placeholder: "0",
    quickReplies: ["0", "2"],
    parse: parseNonNegativeInt,
  },
  {
    key: "srfs",
    ask: () => "SRFs (overall)?",
    placeholder: "0",
    quickReplies: ["0", "1"],
    parse: parseNonNegativeInt,
  },
  {
    key: "talktimeMinutes",
    ask: () => "Talktime minutes (overall)?",
    placeholder: "0",
    quickReplies: ["0", "180"],
    parse: parseNonNegativeInt,
  },
  {
    key: "otpVerified",
    ask: () => "Mobile OTP verified?",
    quickReplies: ["Yes", "No"],
    parse: parseYesNo,
  },
  {
    key: "whatsappSent",
    ask: () => "WhatsApp link and brochure sent?",
    quickReplies: ["Yes", "No"],
    parse: parseYesNo,
  },
  {
    key: "crmNoteAdded",
    ask: () => "CRM note added?",
    quickReplies: ["Yes", "No"],
    parse: parseYesNo,
  },
  {
    key: "leadStageMoved",
    ask: () => "Lead sub-stage moved?",
    quickReplies: ["Yes", "No"],
    parse: parseYesNo,
  },
  {
    key: "followUpSet",
    ask: () => "Follow-up date and time set?",
    quickReplies: ["Yes", "No"],
    parse: parseYesNo,
  },
  {
    key: "comments",
    ask: () => "Manager comments / blockers? (optional)",
    placeholder: "Type notes, or send blank to skip",
    parse: (raw) => (raw || "").trim(),
  },
  {
    key: "confirm",
    ask: () => buildConfirmationText(),
    quickReplies: ["Submit", "Edit buckets", "Restart"],
    parse: (raw) => {
      const v = (raw || "").trim().toLowerCase();
      if (v === "submit") return "Submit";
      if (v === "edit buckets") return "Edit buckets";
      if (v === "restart") return "Restart";
      return { error: "Please choose: Submit / Edit buckets / Restart." };
    },
  },
];

// --- Init ---
restartButton.addEventListener("click", () => restartConversation());
backButton.addEventListener("click", () => goBack());
sendButton.addEventListener("click", () => handleSend());
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

// Start conversation only after successful auth.

function wireBrandFallback() {
  const img = document.querySelector(".brand-logo");
  const fallback = document.querySelector(".brand-fallback");
  if (!img || !fallback) return;

  const showFallback = () => {
    img.style.display = "none";
    fallback.style.display = "inline";
  };

  // If the asset path is wrong/missing, show readable text.
  img.addEventListener("error", showFallback);
  if (img.complete && img.naturalWidth === 0) showFallback();
}

function lockUIForAuth() {
  // Disable interaction until auth is successful.
  chatInput.disabled = true;
  sendButton.disabled = true;
  restartButton.disabled = true;
  backButton.disabled = true;
  quickRepliesEl.innerHTML = "";
  chatLog.innerHTML = "";
}

function unlockUIAfterAuth() {
  authGate.classList.add("hidden");
  chatInput.disabled = false;
  sendButton.disabled = false;
  restartButton.disabled = false;
  backButton.disabled = history.length === 0;
  chatInput.focus();

  if (!conversationStarted) {
    conversationStarted = true;
    restartConversation();
  }
}

function showAuthError(message) {
  authError.textContent = message || "";
}

function initAuth() {
  // Firebase Auth requires an authorized web origin (http/https). file:// won't work.
  if (window.location.protocol === "file:") {
    authGate.classList.remove("hidden");
    showAuthError("Google sign-in won't work from a file. Open this app from a hosted URL (Vercel) or localhost.");
    googleSignInButton.disabled = true;
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();

  // Try to finish a redirect sign-in if we were redirected back.
  getRedirectResult(auth).catch(() => {
    // Ignore; auth state listener below will handle steady state.
  });

  googleSignInButton.addEventListener("click", async () => {
    showAuthError("");
    googleSignInButton.disabled = true;
    setGoogleButtonLabel("Signing in...");

    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = err?.code || "";
      // Mobile Safari and some in-app browsers are more reliable with redirect.
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          showAuthError("Could not start Google sign-in. Please try again.");
        }
      } else {
        showAuthError("Could not sign in. Please try again.");
      }
    } finally {
      googleSignInButton.disabled = false;
      setGoogleButtonLabel("Continue with Google");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      authGate.classList.remove("hidden");
      lockUIForAuth();
      return;
    }

    const email = String(user.email || "").toLowerCase();
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      showAuthError(`Access denied. Please sign in with an ${ALLOWED_EMAIL_DOMAIN} email ID.`);
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
      authGate.classList.remove("hidden");
      lockUIForAuth();
      return;
    }

    showAuthError("");
    unlockUIAfterAuth();
  });
}

function setGoogleButtonLabel(label) {
  // Keep the icon; only update the text node.
  const existingText = googleSignInButton.querySelector(".google-button-label");
  if (existingText) {
    existingText.textContent = label;
    return;
  }
  const span = document.createElement("span");
  span.className = "google-button-label";
  span.textContent = label;
  googleSignInButton.appendChild(span);
}

function restartConversation() {
  chatLog.innerHTML = "";
  quickRepliesEl.innerHTML = "";
  chatInput.value = "";
  chatInput.disabled = false;
  sendButton.disabled = false;
  awaitingCustomUI = null;
  promptIndex = 0;
  history.length = 0;

  // reset state
  state.entryDate = currentDateISO();
  state.counsellorName = "";
  state.teamName = "";
  state.managerName = "";
  state.totalCalls = 0;
  state.connectedCalls = 0;
  state.applications = 0;
  state.srfs = 0;
  state.talktimeMinutes = 0;
  state.otpVerified = "No";
  state.whatsappSent = "No";
  state.crmNoteAdded = "No";
  state.leadStageMoved = "No";
  state.followUpSet = "No";
  state.selectedBucketIndexes = new Set();
  state.bucketCounts = new Map();
  state.comments = "";

  pushBot(
    "Hi. I’ll capture your daily tracker in a few quick questions, then save it to Google Sheets.\n\nYou can use quick replies, type answers, or press Back/Restart anytime."
  );
  askCurrentPrompt();
}

function goBack() {
  const snap = history.pop();
  if (!snap) return;

  restoreStateSnapshot(snap.stateSnapshot);
  promptIndex = snap.promptIndex;
  awaitingCustomUI = null;

  rebuildBucketCountPrompts();
  askCurrentPrompt(true);
}

function handleSend() {
  if (sendButton.disabled) return;
  const raw = chatInput.value;
  if (awaitingCustomUI) return; // bucket UI uses its own Done button
  chatInput.value = "";
  handleAnswer(raw);
}

function handleAnswer(raw) {
  const prompt = prompts[promptIndex];
  if (!prompt) return;

  pushUser(raw || "");

  // Snapshot BEFORE parsing/applying, so Back returns to the previous question state.
  const snapshotBefore = makeStateSnapshot();

  const parsed = prompt.parse ? prompt.parse(raw) : raw;
  if (parsed && typeof parsed === "object" && parsed.error) {
    pushBot(parsed.error);
    askCurrentPrompt(true);
    return;
  }

  if (prompt.key === "confirm") {
    if (parsed === "Restart") {
      restartConversation();
      return;
    }
    if (parsed === "Edit buckets") {
      // Jump to bucket selection prompt
      promptIndex = prompts.findIndex((p) => p.key === "bucketSelect");
      askCurrentPrompt(true);
      return;
    }
    if (parsed === "Submit") {
      submitPayload();
      return;
    }
  }

  history.push({ promptIndex, stateSnapshot: snapshotBefore });

  if (typeof prompt.key === "string" && prompt.key.startsWith("bucketCount:")) {
    // key format: bucketCount:{index}:{field}
    const parts = prompt.key.split(":");
    const bucketIndex = Number(parts[1]);
    const field = parts[2];
    const prev = state.bucketCounts.get(bucketIndex) || { calls: 0, connected: 0, apps: 0, srf: 0 };
    const next = { ...prev, [field]: toNumber(parsed) };
    state.bucketCounts.set(bucketIndex, next);
  } else if (prompt.key in state) {
    state[prompt.key] = parsed;
  }

  promptIndex += 1;
  askCurrentPrompt();
}

function askCurrentPrompt(force = false) {
  const prompt = prompts[promptIndex];
  if (!prompt) return;

  // Clear quick replies each time
  quickRepliesEl.innerHTML = "";

  if (!force) {
    pushBot(prompt.ask());
  }

  if (prompt.customUI === "bucket_select") {
    awaitingCustomUI = { type: "bucket_select" };
    renderBucketSelector();
    chatInput.disabled = true;
    sendButton.disabled = true;
    backButton.disabled = history.length === 0;
    return;
  }

  awaitingCustomUI = null;
  chatInput.disabled = false;
  sendButton.disabled = false;
  backButton.disabled = history.length === 0;

  chatInput.placeholder = prompt.placeholder || "Type your answer";
  if (prompt.quickReplies && prompt.quickReplies.length) {
    renderQuickReplies(prompt.quickReplies);
  }

  chatInput.focus();
  scrollChatToBottom();
}

function renderQuickReplies(replies) {
  quickRepliesEl.innerHTML = "";
  replies.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qr";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (awaitingCustomUI) return;
      chatInput.value = "";
      handleAnswer(label);
    });
    quickRepliesEl.appendChild(btn);
  });
}

function renderBucketSelector() {
  // Insert a card UI inside the latest bot message bubble.
  const lastBotBubble = chatLog.querySelector(".msg.bot:last-child .bubble");
  if (!lastBotBubble) return;

  // Clear any previous card
  const existing = lastBotBubble.querySelector(".bucket-card");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.className = "bucket-card";
  card.innerHTML = `
    <h3>Select buckets worked on</h3>
    <div class="bucket-list" id="bucketList"></div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
      <button type="button" class="secondary compact" id="bucketSelectNone">Select none</button>
      <button type="button" class="compact" id="bucketDone">Done</button>
    </div>
  `;

  lastBotBubble.appendChild(card);

  const list = card.querySelector("#bucketList");
  buckets.forEach((b, idx) => {
    const item = document.createElement("label");
    item.className = "bucket-item";
    item.innerHTML = `
      <input type="checkbox" ${state.selectedBucketIndexes.has(idx) ? "checked" : ""} />
      <div>
        <strong>${escapeHtml(b.bucket)}</strong>
        <span>${escapeHtml(b.subStages)}</span>
      </div>
    `;
    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedBucketIndexes.add(idx);
      else state.selectedBucketIndexes.delete(idx);
    });
    list.appendChild(item);
  });

  card.querySelector("#bucketSelectNone").addEventListener("click", () => {
    state.selectedBucketIndexes.clear();
    card.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  });

  card.querySelector("#bucketDone").addEventListener("click", () => {
    history.push({ promptIndex, stateSnapshot: makeStateSnapshot() });

    // Add per-selected bucket prompts immediately after this prompt index,
    // but only once per pass (rebuild each time you revisit bucket selection).
    rebuildBucketCountPrompts();

    awaitingCustomUI = null;
    chatInput.disabled = false;
    sendButton.disabled = false;
    chatInput.value = "";

    promptIndex += 1;
    askCurrentPrompt();
  });

  scrollChatToBottom();
}

function insertBucketCountPrompts() {
  // Remove any previously inserted bucket count prompts (from an earlier selection).
  for (let i = prompts.length - 1; i >= 0; i -= 1) {
    if (prompts[i] && prompts[i].key && String(prompts[i].key).startsWith("bucketCount:")) {
      prompts.splice(i, 1);
    }
  }

  const bucketSelectIndex = prompts.findIndex((p) => p && p.key === "bucketSelect");
  const insertAt = (bucketSelectIndex === -1 ? promptIndex : bucketSelectIndex) + 1;
  const selected = Array.from(state.selectedBucketIndexes).sort((a, b) => a - b);
  const dynamic = [];

  selected.forEach((bucketIndex) => {
    const name = buckets[bucketIndex].bucket;
    const baseKey = `bucketCount:${bucketIndex}`;

    dynamic.push(
      makeBucketNumberPrompt(`${baseKey}:calls`, name, bucketIndex, "calls", "Calls for this bucket?", ["0"]),
      makeBucketNumberPrompt(`${baseKey}:connected`, name, bucketIndex, "connected", "Connected calls for this bucket?", ["0"]),
      makeBucketNumberPrompt(`${baseKey}:apps`, name, bucketIndex, "apps", "Applications for this bucket?", ["0"]),
      makeBucketNumberPrompt(`${baseKey}:srf`, name, bucketIndex, "srf", "SRF for this bucket?", ["0"])
    );
  });

  prompts.splice(insertAt, 0, ...dynamic);
}

function makeBucketNumberPrompt(key, bucketName, bucketIndex, field, question, quickReplies) {
  return {
    key,
    ask: () => `Bucket: ${bucketName}\n${question}`,
    placeholder: "0",
    quickReplies,
    parse: (raw) => {
      const v = parseNonNegativeInt(raw);
      if (v && typeof v === "object" && v.error) return v;
      return v;
    },
  };
}

function rebuildBucketCountPrompts() {
  insertBucketCountPrompts();
}

async function submitPayload() {
  if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    showToast("Paste your Google Apps Script Web App URL in script.js first.", true);
    pushBot("Your Apps Script URL is not set yet. Update `GOOGLE_SCRIPT_URL` in script.js and try again.");
    return;
  }

  const payload = buildPayload();

  chatInput.disabled = true;
  sendButton.disabled = true;
  quickRepliesEl.innerHTML = "";
  pushBot("Saving to Google Sheets...");

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    showToast("Daily data saved to Google Sheets.");
    pushBot("Done. Saved to Google Sheets.\n\nType Restart to log another day.");
    renderQuickReplies(["Restart"]);
    chatInput.disabled = false;
    sendButton.disabled = false;
    chatInput.placeholder = "Type Restart to begin again";
    chatInput.focus();
  } catch (error) {
    showToast("Could not save. Check the Apps Script deployment URL and access.", true);
    pushBot("Could not save. Please check the Apps Script deployment URL and access.");
    chatInput.disabled = false;
    sendButton.disabled = false;
  }
}

function buildPayload() {
  return {
    submittedAt: new Date().toISOString(),
    entryDate: currentDateISO(),
    counsellorName: state.counsellorName,
    teamName: state.teamName,
    managerName: state.managerName,
    totalCalls: toNumber(state.totalCalls),
    connectedCalls: toNumber(state.connectedCalls),
    applications: toNumber(state.applications),
    srfs: toNumber(state.srfs),
    talktimeMinutes: toNumber(state.talktimeMinutes),
    otpVerified: state.otpVerified || "No",
    whatsappSent: state.whatsappSent || "No",
    crmNoteAdded: state.crmNoteAdded || "No",
    leadStageMoved: state.leadStageMoved || "No",
    followUpSet: state.followUpSet || "No",
    comments: state.comments || "",
    buckets: buckets.map((item, index) => {
      const counts = state.bucketCounts.get(index) || { calls: 0, connected: 0, apps: 0, srf: 0 };
      return {
        selected: state.selectedBucketIndexes.has(index) ? "Yes" : "No",
        number: index + 1,
        bucket: item.bucket,
        subStages: item.subStages,
        calls: toNumber(counts.calls),
        connected: toNumber(counts.connected),
        apps: toNumber(counts.apps),
        srf: toNumber(counts.srf),
      };
    }),
  };
}

function buildConfirmationText() {
  const selected = Array.from(state.selectedBucketIndexes)
    .sort((a, b) => a - b)
    .map((idx) => `${idx + 1}. ${buckets[idx].bucket}`)
    .join("\n");

  const selectedBlock = selected ? `Buckets selected:\n${selected}` : "Buckets selected: none";

  return (
    "Review before submit:\n\n" +
    `Date: ${currentDateISO()}\n` +
    `Counsellor: ${state.counsellorName}\n` +
    `Team: ${state.teamName || "—"}\n` +
    `Manager: ${state.managerName || "—"}\n\n` +
    `${selectedBlock}\n\n` +
    `KPI totals: ${state.totalCalls} calls, ${state.connectedCalls} connected, ${state.applications} apps, ${state.srfs} SRF, ${state.talktimeMinutes} talktime mins\n\n` +
    `CRM actions: OTP ${state.otpVerified}, WhatsApp ${state.whatsappSent}, Note ${state.crmNoteAdded}, Stage ${state.leadStageMoved}, Follow-up ${state.followUpSet}\n\n` +
    "Choose Submit to save to Google Sheets."
  );
}

function pushBot(text) {
  const row = document.createElement("div");
  row.className = "msg bot";
  row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatLog.appendChild(row);
  scrollChatToBottom();
}

function pushUser(text) {
  const row = document.createElement("div");
  row.className = "msg user";
  row.innerHTML = `<div class="bubble">${escapeHtml(text || "(blank)")}</div>`;
  chatLog.appendChild(row);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function parseNonNegativeInt(raw) {
  const v = String(raw || "").trim();
  if (v === "") return 0;
  if (!/^\d+$/.test(v)) return { error: "Please enter a non-negative number (example: 0, 12, 150)." };
  return Number(v);
}

function parseYesNo(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "y" || v === "yes") return "Yes";
  if (v === "n" || v === "no") return "No";
  return { error: "Please answer Yes or No." };
}

function toNumber(value) {
  return Number(value || 0);
}

function makeStateSnapshot() {
  return {
    entryDate: state.entryDate,
    counsellorName: state.counsellorName,
    teamName: state.teamName,
    managerName: state.managerName,
    totalCalls: state.totalCalls,
    connectedCalls: state.connectedCalls,
    applications: state.applications,
    srfs: state.srfs,
    talktimeMinutes: state.talktimeMinutes,
    otpVerified: state.otpVerified,
    whatsappSent: state.whatsappSent,
    crmNoteAdded: state.crmNoteAdded,
    leadStageMoved: state.leadStageMoved,
    followUpSet: state.followUpSet,
    comments: state.comments,
    selectedBucketIndexes: Array.from(state.selectedBucketIndexes),
    bucketCounts: Array.from(state.bucketCounts.entries()),
  };
}

function restoreStateSnapshot(snap) {
  state.entryDate = snap.entryDate || currentDateISO();
  state.counsellorName = snap.counsellorName || "";
  state.teamName = snap.teamName || "";
  state.managerName = snap.managerName || "";
  state.totalCalls = toNumber(snap.totalCalls);
  state.connectedCalls = toNumber(snap.connectedCalls);
  state.applications = toNumber(snap.applications);
  state.srfs = toNumber(snap.srfs);
  state.talktimeMinutes = toNumber(snap.talktimeMinutes);
  state.otpVerified = snap.otpVerified || "No";
  state.whatsappSent = snap.whatsappSent || "No";
  state.crmNoteAdded = snap.crmNoteAdded || "No";
  state.leadStageMoved = snap.leadStageMoved || "No";
  state.followUpSet = snap.followUpSet || "No";
  state.comments = snap.comments || "";
  state.selectedBucketIndexes = new Set(snap.selectedBucketIndexes || []);
  state.bucketCounts = new Map(snap.bucketCounts || []);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 3600);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
