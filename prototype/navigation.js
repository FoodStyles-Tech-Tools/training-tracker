/**
 * Shared navigation sidebar and header for all prototype pages
 * This ensures consistent navigation across all prototype HTML files
 */

function renderHeader() {
  return `
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 sm:px-6">
      <div class="flex flex-1 items-center gap-3">
        <button
          type="button"
          id="mobile-menu-button"
          class="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden"
          aria-label="Open navigation"
          onclick="openMobileNav()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          Menu
        </button>
        <div>
          <p class="text-sm font-semibold text-slate-100 lg:hidden">Competency Training Tracker</p>
          <p class="text-xs uppercase tracking-wide text-slate-500">Signed in as</p>
          <p class="text-sm font-medium text-slate-50">Admin User</p>
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <button
          type="button"
          class="rounded-md border border-slate-700 px-3 py-2 text-slate-200 transition hover:border-blue-500 hover:text-blue-200"
        >
          Logout
        </button>
      </div>
    </header>
  `;
}

function renderSidebar(currentPage) {
  const navigation = [
    { href: "waitlist.html", label: "Waitlist", id: "waitlist" },
    { href: "learner_dashboard.html", label: "Learner Dashboard", id: "learner-dashboard" },
    { href: "competency.html", label: "Competencies", id: "competencies" },
    { href: "training_batch.html", label: "Training Batches", id: "training-batches" },
    { href: "training_request.html", label: "Training Request", id: "training-request" },
    { href: "validation_project_approval.html", label: "Validation Project Approval", id: "validation-project-approval" },
    { href: "validation_schedule_request.html", label: "Validation Schedule Request", id: "validation-schedule-request" },
    { href: "project_assignment_request.html", label: "Project Assignment Request", id: "project-assignment-request" },
    { href: "users.html", label: "Users", id: "users" },
    { href: "roles.html", label: "Roles", id: "roles" },
    { href: "activity_log.html", label: "Activity Log", id: "activity-log" },
  ];

  return `
    <aside class="hidden w-64 border-r border-slate-800 bg-slate-950/80 p-6 lg:flex lg:flex-col">
      <div class="space-y-8">
        <div>
          <p class="text-lg font-semibold text-white">Competency Training Tracker</p>
          <p class="text-sm text-slate-400">Admin</p>
        </div>
        <nav class="space-y-2">
          ${navigation
            .map(
              (item) => `
            <a
              href="${item.href}"
              class="block rounded-md px-3 py-2 text-sm font-medium transition ${
                item.id === currentPage
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              }"
            >
              ${item.label}
            </a>
          `
            )
            .join("")}
        </nav>
      </div>
    </aside>
  `;
}

// Function to inject sidebar
function injectSidebar() {
  const sidebarContainer = document.querySelector("[data-sidebar]");
  if (sidebarContainer) {
    // Determine current page based on filename
    const currentPath = window.location.pathname;
    let currentPage = "";

    if (currentPath.includes("waitlist.html")) {
      currentPage = "waitlist";
    } else if (currentPath.includes("learner_dashboard.html")) {
      currentPage = "learner-dashboard";
    } else if (currentPath.includes("competency.html")) {
      currentPage = "competencies";
    } else if (currentPath.includes("training_batch.html")) {
      currentPage = "training-batches";
    } else if (currentPath.includes("training_request.html")) {
      currentPage = "training-request";
    } else if (currentPath.includes("validation_project_approval.html")) {
      currentPage = "validation-project-approval";
    } else if (currentPath.includes("project_assignment_request.html")) {
      currentPage = "project-assignment-request";
    } else if (currentPath.includes("validation_schedule_request.html")) {
      currentPage = "validation-schedule-request";
    } else if (currentPath.includes("competency_form.html")) {
      currentPage = "competencies"; // Form page uses competencies as active
    } else if (currentPath.includes("users.html")) {
      currentPage = "users";
    } else if (currentPath.includes("roles.html")) {
      currentPage = "roles";
    } else if (currentPath.includes("activity_log.html")) {
      currentPage = "activity-log";
    }

    sidebarContainer.innerHTML = renderSidebar(currentPage);
  }
}

// Function to render mobile navigation modal
function renderMobileNav(currentPage) {
  const navigation = [
    { href: "waitlist.html", label: "Waitlist", id: "waitlist" },
    { href: "learner_dashboard.html", label: "Learner Dashboard", id: "learner-dashboard" },
    { href: "competency.html", label: "Competencies", id: "competencies" },
    { href: "training_batch.html", label: "Training Batches", id: "training-batches" },
    { href: "training_request.html", label: "Training Request", id: "training-request" },
    { href: "validation_project_approval.html", label: "Validation Project Approval", id: "validation-project-approval" },
    { href: "validation_schedule_request.html", label: "Validation Schedule Request", id: "validation-schedule-request" },
    { href: "project_assignment_request.html", label: "Project Assignment Request", id: "project-assignment-request" },
    { href: "users.html", label: "Users", id: "users" },
    { href: "roles.html", label: "Roles", id: "roles" },
    { href: "activity_log.html", label: "Activity Log", id: "activity-log" },
  ];

  return `
    <div id="mobile-nav-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/90 backdrop-blur-sm" onclick="closeMobileNav(event)">
      <div class="max-w-xs w-full bg-slate-900 border border-slate-800 rounded-lg p-6 m-4" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <p class="text-sm font-semibold text-white">Navigation</p>
          <button
            type="button"
            class="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onclick="closeMobileNav()"
            aria-label="Close navigation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <nav class="mt-4 space-y-2">
          ${navigation
            .map(
              (item) => `
            <a
              href="${item.href}"
              onclick="closeMobileNav()"
              class="block rounded-md px-3 py-2 text-sm font-medium transition ${
                item.id === currentPage
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              }"
            >
              ${item.label}
            </a>
          `
            )
            .join("")}
        </nav>
      </div>
    </div>
  `;
}

// Function to inject header
function injectHeader() {
  const headerContainer = document.querySelector("[data-header]");
  if (headerContainer) {
    headerContainer.innerHTML = renderHeader();
  }
}

// Function to inject mobile nav modal
function injectMobileNav() {
  // Check if modal already exists
  if (document.getElementById("mobile-nav-modal")) {
    return;
  }

  // Determine current page
  const currentPath = window.location.pathname;
  let currentPage = "";

  if (currentPath.includes("waitlist.html")) {
    currentPage = "waitlist";
  } else if (currentPath.includes("learner_dashboard.html")) {
    currentPage = "learner-dashboard";
  } else if (currentPath.includes("competency.html")) {
    currentPage = "competencies";
  } else if (currentPath.includes("training_batch.html")) {
    currentPage = "training-batches";
  } else if (currentPath.includes("training_request.html")) {
    currentPage = "training-request";
  } else if (currentPath.includes("validation_project_approval.html")) {
    currentPage = "validation-project-approval";
  } else if (currentPath.includes("project_assignment_request.html")) {
    currentPage = "project-assignment-request";
  } else if (currentPath.includes("validation_schedule_request.html")) {
    currentPage = "validation-schedule-request";
  } else if (currentPath.includes("competency_form.html")) {
    currentPage = "competencies";
  } else if (currentPath.includes("users.html")) {
    currentPage = "users";
  } else if (currentPath.includes("roles.html")) {
    currentPage = "roles";
  } else if (currentPath.includes("activity_log.html")) {
    currentPage = "activity-log";
  }

  // Append modal to body
  const modal = document.createElement("div");
  modal.innerHTML = renderMobileNav(currentPage);
  document.body.appendChild(modal.firstElementChild);
}

// Mobile nav functions
function openMobileNav() {
  const modal = document.getElementById("mobile-nav-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.style.overflow = "hidden";
  }
}

function closeMobileNav(event) {
  if (event && event.target !== event.currentTarget) {
    return;
  }
  const modal = document.getElementById("mobile-nav-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
  }
}

// Make functions globally available
window.openMobileNav = openMobileNav;
window.closeMobileNav = closeMobileNav;

// Auto-inject sidebar, header, and mobile nav when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectSidebar();
    injectHeader();
    injectMobileNav();
  });
} else {
  // DOM already loaded
  injectSidebar();
  injectHeader();
  injectMobileNav();
}

// Close mobile nav on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("mobile-nav-modal");
    if (modal && !modal.classList.contains("hidden")) {
      closeMobileNav();
    }
  }
});

