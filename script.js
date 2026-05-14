const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwISHyAXQZVix0RgQbCgTJU00AKBsi8DXqIqWevop52kcKkrN5EqxO2qEwSNWeeezG5fQ/exec";

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

const form = document.querySelector("#dailyTrackerForm");
const submitButton = document.querySelector("#submitButton");
const connectionStatus = document.querySelector("#connectionStatus");
const toast = document.querySelector("#toast");
const recentList = document.querySelector("#recentList");
const submissionCount = document.querySelector("#submissionCount");
const sessionApps = document.querySelector("#sessionApps");
const sessionSrfs = document.querySelector("#sessionSrfs");
const sessionCalls = document.querySelector("#sessionCalls");
const bucketTable = document.querySelector("#bucketTable");

const today = new Date().toISOString().slice(0, 10);
const submissions = [];

document.querySelector('input[name="entryDate"]').value = today;
renderBucketTable();

if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
  connectionStatus.textContent = "Add script URL";
  connectionStatus.classList.add("warning");
}

document.querySelector("#clearBuckets").addEventListener("click", () => {
  bucketTable.querySelectorAll("input").forEach((input) => {
    if (input.type === "checkbox") {
      input.checked = false;
    } else {
      input.value = "";
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    showToast("Paste your Google Apps Script Web App URL in script.js first.", true);
    return;
  }

  const payload = collectPayload();

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    submissions.unshift(payload);
    renderSummary();
    form.reset();
    document.querySelector('input[name="entryDate"]').value = today;
    showToast("Daily data saved to Google Sheets.");
  } catch (error) {
    showToast("Could not save. Check the Apps Script deployment URL and access.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Daily Data";
  }
});

function renderBucketTable() {
  bucketTable.innerHTML = `
    <div class="bucket-title">Daily Execution Checklist — with CRM Sub-Stages Mapped</div>
    <div class="bucket-header">
      <span>✓</span>
      <span>#</span>
      <span>Bucket (Lead Stage)</span>
      <span>CRM Sub-Stages to Filter</span>
      <span>Calls</span>
      <span>Conn.</span>
      <span>Apps</span>
      <span>SRF</span>
    </div>
    ${buckets
      .map(
        (item, index) => `
          <div class="bucket-row">
            <span class="bucket-check"><input aria-label="${item.bucket} selected" type="checkbox" name="bucket_${index}_selected" value="Yes" /></span>
            <span class="bucket-number">${index + 1}</span>
            <span class="bucket-name">${escapeHtml(item.bucket)}</span>
            <span class="bucket-substage">${escapeHtml(item.subStages)}</span>
            <input aria-label="${item.bucket} calls" type="number" min="0" inputmode="numeric" name="bucket_${index}_calls" />
            <input aria-label="${item.bucket} connected calls" type="number" min="0" inputmode="numeric" name="bucket_${index}_connected" />
            <input aria-label="${item.bucket} applications" type="number" min="0" inputmode="numeric" name="bucket_${index}_apps" />
            <input aria-label="${item.bucket} SRF" type="number" min="0" inputmode="numeric" name="bucket_${index}_srf" />
          </div>
        `
      )
      .join("")}
    <div class="bucket-row bucket-total">
      <span></span>
      <span></span>
      <span>TOTALS</span>
      <span>(auto-sum all buckets)</span>
      <strong id="bucketCallsTotal">0</strong>
      <strong id="bucketConnectedTotal">0</strong>
      <strong id="bucketAppsTotal">0</strong>
      <strong id="bucketSrfTotal">0</strong>
    </div>
  `;

  bucketTable.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("input", updateBucketTotals);
  });
}

function collectPayload() {
  const data = Object.fromEntries(new FormData(form).entries());

  return {
    submittedAt: new Date().toISOString(),
    entryDate: data.entryDate,
    counsellorName: data.counsellorName,
    teamName: data.teamName,
    managerName: data.managerName,
    totalCalls: toNumber(data.totalCalls),
    connectedCalls: toNumber(data.connectedCalls),
    applications: toNumber(data.applications),
    srfs: toNumber(data.srfs),
    talktimeMinutes: toNumber(data.talktimeMinutes),
    otpVerified: data.otpVerified || "No",
    whatsappSent: data.whatsappSent || "No",
    crmNoteAdded: data.crmNoteAdded || "No",
    leadStageMoved: data.leadStageMoved || "No",
    followUpSet: data.followUpSet || "No",
    comments: data.comments || "",
    buckets: buckets.map((item, index) => ({
      selected: data[`bucket_${index}_selected`] || "No",
      number: index + 1,
      bucket: item.bucket,
      subStages: item.subStages,
      calls: toNumber(data[`bucket_${index}_calls`]),
      connected: toNumber(data[`bucket_${index}_connected`]),
      apps: toNumber(data[`bucket_${index}_apps`]),
      srf: toNumber(data[`bucket_${index}_srf`]),
    })),
  };
}

function updateBucketTotals() {
  document.querySelector("#bucketCallsTotal").textContent = sumBucketInputs("calls");
  document.querySelector("#bucketConnectedTotal").textContent = sumBucketInputs("connected");
  document.querySelector("#bucketAppsTotal").textContent = sumBucketInputs("apps");
  document.querySelector("#bucketSrfTotal").textContent = sumBucketInputs("srf");
}

function sumBucketInputs(key) {
  return Array.from(bucketTable.querySelectorAll(`input[name$="_${key}"]`)).reduce(
    (total, input) => total + toNumber(input.value),
    0
  );
}

function renderSummary() {
  submissionCount.textContent = submissions.length;
  sessionApps.textContent = sum(submissions, "applications");
  sessionSrfs.textContent = sum(submissions, "srfs");
  sessionCalls.textContent = sum(submissions, "totalCalls");

  recentList.innerHTML = "";

  submissions.slice(0, 6).forEach((item) => {
    const card = document.createElement("article");
    card.className = "record-card";
    card.innerHTML = `
      <strong>${escapeHtml(item.counsellorName)}</strong>
      <span>${escapeHtml(item.entryDate)} · ${escapeHtml(item.teamName || "No team")}</span>
      <span>${item.totalCalls} calls · ${item.connectedCalls} connected · ${item.applications} apps · ${item.srfs} SRF</span>
    `;
    recentList.appendChild(card);
  });
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function toNumber(value) {
  return Number(value || 0);
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
