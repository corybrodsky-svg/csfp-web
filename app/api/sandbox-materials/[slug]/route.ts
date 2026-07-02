import { NextResponse } from "next/server";

type SandboxMaterial = {
  title: string;
  subtitle: string;
  sections: Array<{
    heading: string;
    body: string[];
  }>;
};

const STROKE_CASE_PROFILE = {
  title: "Neurologic Assessment: Stroke Warning Signs",
  learnerContext: "Senior adult-health nursing learners completing a focused neurologic assessment and caregiver-communication simulation.",
  objectives: [
    "Recognize possible stroke warning signs and establish time last known well.",
    "Perform focused speech, facial symmetry, arm strength, orientation, and safety checks.",
    "Escalate promptly using clear, closed-loop communication.",
    "Educate the caregiver with plain language and avoid false reassurance.",
  ],
  patientProfile:
    "Fictional adult patient Jordan Price, age 64, presenting with sudden facial droop, slurred speech, and right-arm weakness noticed during breakfast. This is fake sandbox content only.",
  spCharacteristics:
    "Calm but worried; answers short questions; occasionally searches for words; mildly frustrated by speech difficulty; follows instructions slowly; can portray subtle right-sided weakness without unsafe movement.",
  affectBehavior: "Anxious, cooperative, embarrassed by slurred speech, and looks to caregiver for timeline details when unsure.",
  physicalPresentation:
    "Slight right facial droop cue, reduced right hand grip cue, optional asymmetrical smile card, no invasive procedures, and no real clinical measurements.",
  openingStatement: "\"My words feel strange, and my right arm does not feel right.\"",
  keyHistory:
    "Symptoms began suddenly around 7:10 AM. Last known well was about 6:45 AM. Mild headache denied. No fall. Takes a fictional blood pressure medication. Caregiver noticed uneven smile and a dropped mug.",
  expectedLearnerActions:
    "Introduce self, assess immediate safety, perform FAST-style screening, check orientation/speech/strength, ask last-known-well time, keep patient safe, escalate to the provider/stroke response workflow, and explain urgency without alarming the caregiver.",
  facultyCoaching:
    "Listen for time-last-known-well, escalation language, closed-loop communication, and caregiver education. Redirect learners who minimize symptoms or delay escalation.",
  roomSetup:
    "Room 4 requires chair, bedside table, call light prop, neuro assessment cue card, caregiver chair, clock visible to learner, and no real patient identifiers.",
  readiness:
    "SP case brief ready; learner flow preview ready; Room 4 setup pending; faculty guide pending final review.",
};

const MATERIALS: Record<string, SandboxMaterial> = {
  "stroke-warning-signs-sp-case-brief": {
    title: "Stroke Warning Signs - SP Case Brief",
    subtitle: "Fictional sandbox case material for external tester review",
    sections: [
      {
        heading: "Case Profile",
        body: [
          `Case title: ${STROKE_CASE_PROFILE.title}`,
          `Learner level/context: ${STROKE_CASE_PROFILE.learnerContext}`,
          `Patient/SP profile: ${STROKE_CASE_PROFILE.patientProfile}`,
        ],
      },
      {
        heading: "SP Characteristics",
        body: [
          STROKE_CASE_PROFILE.spCharacteristics,
          `Affect/behavior: ${STROKE_CASE_PROFILE.affectBehavior}`,
          `Physical presentation/moulage: ${STROKE_CASE_PROFILE.physicalPresentation}`,
        ],
      },
      {
        heading: "Opening And History",
        body: [
          `Opening statement: ${STROKE_CASE_PROFILE.openingStatement}`,
          `Key history points: ${STROKE_CASE_PROFILE.keyHistory}`,
        ],
      },
      {
        heading: "Expected Learner Actions",
        body: STROKE_CASE_PROFILE.objectives.concat([STROKE_CASE_PROFILE.expectedLearnerActions]),
      },
      {
        heading: "Readiness State",
        body: [STROKE_CASE_PROFILE.readiness],
      },
    ],
  },
  "stroke-warning-signs-faculty-guide": {
    title: "Stroke Warning Signs - Faculty Guide",
    subtitle: "Pending final review in the sandbox showcase event",
    sections: [
      {
        heading: "Teaching Focus",
        body: STROKE_CASE_PROFILE.objectives,
      },
      {
        heading: "Faculty Coaching Notes",
        body: [
          STROKE_CASE_PROFILE.facultyCoaching,
          "Watch for learners who collect extra history without escalating the stroke concern.",
          "Debrief the difference between calm communication and delay.",
        ],
      },
      {
        heading: "Assessment Anchors",
        body: [
          "Identifies facial droop, speech change, and unilateral weakness.",
          "Asks for last known well and symptom onset timeline.",
          "Uses closed-loop escalation language.",
          "Explains urgency and next steps to the caregiver.",
        ],
      },
      {
        heading: "Readiness State",
        body: ["Faculty guide pending final review before SP portal release."],
      },
    ],
  },
  "stroke-warning-signs-learner-flow-preview": {
    title: "Stroke Warning Signs - Learner Flow Preview",
    subtitle: "Fictional four-room learner rotation preview",
    sections: [
      {
        heading: "Flow Summary",
        body: [
          "32 fictional learners rotate through four rooms in four rounds.",
          "Each encounter uses 25 minutes of assessment time, 5 minutes of checklist completion, and 5 minutes of transition feedback.",
          "Room 4 is the readiness risk and must be cleared before learner release.",
        ],
      },
      {
        heading: "Learner Expectations",
        body: [
          "Enter the room, introduce role, assess immediate safety, perform focused neurologic screening, escalate promptly, and explain next steps.",
          "No real student records, names, grades, or institutional data are included in this sandbox material.",
        ],
      },
      {
        heading: "Operations Notes",
        body: [
          "Sim Ops should confirm Room 4 setup, faculty guide readiness, SP coverage, and learner traffic flow before opening the event.",
        ],
      },
    ],
  },
  "stroke-warning-signs-room-4-setup-checklist": {
    title: "Stroke Warning Signs - Room 4 Setup Checklist",
    subtitle: "Room readiness checklist for the showcase Event Command Center scenario",
    sections: [
      {
        heading: "Room 4 Required Setup",
        body: [
          STROKE_CASE_PROFILE.roomSetup,
          "Place fictional medication card and caregiver chair on the learner-visible side of the room.",
          "Confirm the wall clock or simulated timestamp is visible before first learner entry.",
        ],
      },
      {
        heading: "Readiness Issue",
        body: [
          "Room 4 is intentionally marked not ready for the sandbox showcase.",
          "Recommended fix: dispatch Sim Ops to complete the setup checklist, then update room readiness before learner release.",
        ],
      },
      {
        heading: "Safety Boundaries",
        body: [
          "No real patient identifiers, real records, invasive procedures, or unsafe physical maneuvers are used.",
        ],
      },
    ],
  },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMaterialHtml(material: SandboxMaterial) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(material.title)}</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #12314b; background: #f7fafc; }
    main { max-width: 860px; margin: 0 auto; padding: 32px 24px 48px; }
    header { border-bottom: 1px solid #d8e6ef; padding-bottom: 18px; margin-bottom: 22px; }
    .kicker { color: #0f766e; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 8px 0 0; font-size: 32px; line-height: 1.12; color: #102a43; }
    .subtitle { margin-top: 8px; color: #50667c; font-size: 14px; font-weight: 700; }
    section { background: #ffffff; border: 1px solid #d8e6ef; border-radius: 12px; padding: 18px; margin-top: 14px; box-shadow: 0 10px 24px rgba(24, 52, 78, .06); }
    h2 { margin: 0 0 10px; font-size: 18px; color: #14304f; }
    p { margin: 8px 0 0; line-height: 1.58; font-size: 14px; font-weight: 650; color: #304b63; }
    .notice { background: #ecfeff; border-color: #bae6fd; color: #075985; }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="kicker">CFSP Sandbox Fictional Material</div>
      <h1>${escapeHtml(material.title)}</h1>
      <div class="subtitle">${escapeHtml(material.subtitle)}</div>
    </header>
    <section class="notice">
      <h2>Sandbox Notice</h2>
      <p>This is fictional, non-confidential sandbox content for CFSP workflow testing. It contains no real PHI, learner records, SP records, institution names, or patient data.</p>
    </section>
    ${material.sections
      .map(
        (section) => `<section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </section>`
      )
      .join("")}
  </main>
</body>
</html>`;
}

export async function GET(request: Request, context: { params: Promise<{ slug?: string | string[] }> }) {
  const params = await context.params;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug || "";
  const material = MATERIALS[slug];
  if (!material) {
    return NextResponse.json({ error: "Sandbox material not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("mode") === "download";
  return new NextResponse(renderMaterialHtml(material), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${slug}.html"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
