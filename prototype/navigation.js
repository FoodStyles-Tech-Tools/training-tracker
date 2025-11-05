/**
 * Shared navigation sidebar for all prototype pages
 * This ensures consistent navigation across all prototype HTML files
 */

function renderSidebar(currentPage) {
  const navigation = [
    { href: "learner_dashboard.html", label: "Learner Dashboard", id: "learner-dashboard" },
    { href: "competency.html", label: "Competencies", id: "competencies" },
    { href: "training_batch.html", label: "Training Batches", id: "training-batches" },
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

    if (currentPath.includes("learner_dashboard.html")) {
      currentPage = "learner-dashboard";
    } else if (currentPath.includes("competency.html")) {
      currentPage = "competencies";
    } else if (currentPath.includes("training_batch.html")) {
      currentPage = "training-batches";
    } else if (currentPath.includes("competency_form.html")) {
      currentPage = "competencies"; // Form page uses competencies as active
    }

    sidebarContainer.innerHTML = renderSidebar(currentPage);
  }
}

// Auto-inject sidebar when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar);
} else {
  // DOM already loaded
  injectSidebar();
}

