document.addEventListener("DOMContentLoaded", () => {
  const quillConfigs = [
    {
      selector: "#basic-knowledge",
      field: "basicKnowledge",
      placeholder: "Describe the foundational expectations for a team member.",
      initial: `<p>Understands brand values and delivers a warm greeting to every guest.</p>
<p>Follows checklist for opening duties with minimal supervision.</p>`,
    },
    {
      selector: "#basic-eligibility",
      field: "basicEligibility",
      placeholder: "Prerequisites to begin Basic level competency.",
      initial: `<p>Completed onboarding modules and shadowed at least 2 full shifts.</p>
<p>Scored 85%+ on the hospitality fundamentals quiz.</p>`,
    },
    {
      selector: "#basic-verification",
      field: "basicVerification",
      placeholder: "How trainers validate Basic competency completion.",
      initial: `<p>Trainer signs off after observing checklist execution across two shifts.</p>
<p>Feedback recorded in LMS with notes and follow-up actions.</p>`,
    },
    {
      selector: "#competent-knowledge",
      field: "competentKnowledge",
      placeholder: "Describe what a competent team member should demonstrate.",
      initial: `<p>Resolves most guest issues independently using the recovery playbook.</p>
<p>Coaches newer teammates on daily standards and best practices.</p>`,
    },
    {
      selector: "#competent-eligibility",
      field: "competentEligibility",
      placeholder: "Prerequisites required to attempt Competent level.",
      initial: `<p>Completed Basic level verification within the last 60 days.</p>
<p>Logged 120+ hours on the floor with positive guest sentiment.</p>`,
    },
    {
      selector: "#competent-verification",
      field: "competentVerification",
      placeholder: "How trainers verify the Competent level.",
      initial: `<p>Trainer shadows one peak shift and a closing shift, confirming playbook usage.</p>
<p>Competency panel reviews guest feedback and peer endorsements.</p>`,
    },
    {
      selector: "#advanced-knowledge",
      field: "advancedKnowledge",
      placeholder: "Describe the level of mastery for advanced team members.",
      initial: `<p>Leads strategic guest recovery initiatives and mentors future trainers.</p>
<p>Analyzes service data to identify trends and propose improvements.</p>`,
    },
    {
      selector: "#advanced-eligibility",
      field: "advancedEligibility",
      placeholder: "Prerequisites needed for Advanced level assessment.",
      initial: `<p>Maintained Competent level status for 6+ months with exceptional performance.</p>
<p>Completed leadership micro-learning series and trainer observation hours.</p>`,
    },
    {
      selector: "#advanced-verification",
      field: "advancedVerification",
      placeholder: "How trainers certify the Advanced level.",
      initial: `<p>Trainer panel evaluates a live service initiative led by the candidate.</p>
<p>Final review with operations leadership and documentation of impact.</p>`,
    },
  ];

  const quillInstances = new Map();

  quillConfigs.forEach((config) => {
    const mountNode = document.querySelector(config.selector);
    if (!mountNode || typeof Quill === "undefined") {
      return;
    }

    const editor = new Quill(mountNode, {
      theme: "snow",
      placeholder: config.placeholder,
      modules: {
        toolbar: [
          [{ header: [false, 2, 3] }],
          ["bold", "italic", "underline"],
          ["link"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["clean"],
        ],
      },
    });
    editor.root.innerHTML = config.initial;
    quillInstances.set(config.selector, editor);
  });

  // Fake save action
  const form = document.querySelector("[data-competency-form]");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const submission = quillConfigs.reduce(
        (acc, config) => {
          const editor = quillInstances.get(config.selector);
          acc[config.field] = editor ? editor.root.innerHTML.trim() : "";
          return acc;
        },
        {
          name: form.querySelector("#competency-name")?.value ?? "",
        },
      );

      submission.basicPlan = form.querySelector("#basic-plan")?.value ?? "";
      submission.competentPlan = form.querySelector("#competent-plan")?.value ?? "";
      submission.advancedPlan = form.querySelector("#advanced-plan")?.value ?? "";

      console.info("Prototype competency publish", submission);

      const status = document.querySelector("[data-toast]");
      if (!status) return;

      status.classList.add("opacity-100", "translate-y-0");
      status.classList.remove("pointer-events-none");

      setTimeout(() => {
        status.classList.remove("opacity-100", "translate-y-0");
        status.classList.add("pointer-events-none");
      }, 2200);
    });
  }
});
