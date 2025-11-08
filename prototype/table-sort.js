/**
 * Table sorting functionality for prototype pages
 * Handles sorting by clicking table headers with visual indicators
 */

function initTableSort(tableElement) {
  const table = typeof tableElement === "string" ? document.querySelector(tableElement) : tableElement;
  if (!table) return;

  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  const headers = thead.querySelectorAll("th");

  let currentSort = {
    column: null,
    direction: "asc", // 'asc' or 'desc'
  };

  // Check if already initialized
  if (table.hasAttribute("data-sort-initialized")) return;
  table.setAttribute("data-sort-initialized", "true");

  // Add sort indicators to headers (except Actions column)
  headers.forEach((header, index) => {
    const headerText = header.textContent.trim();
    if (headerText === "Actions") return; // Skip Actions column

    // Check if indicator already exists
    if (header.querySelector("[data-sort-indicator]")) return;

    // Make header clickable
    header.style.cursor = "pointer";
    header.style.userSelect = "none";
    header.classList.add("hover:bg-slate-800", "transition-colors", "relative");

    // Add sort indicator
    const indicator = document.createElement("span");
    indicator.className = "ml-2 text-slate-500 inline-block";
    indicator.innerHTML = "↕";
    indicator.setAttribute("data-sort-indicator", "");
    header.appendChild(indicator);
  });

  function getCellValue(row, columnIndex) {
    const cell = row.cells[columnIndex];
    if (!cell) return "";

    // Get text content, handling nested elements
    let text = cell.textContent.trim();

    // For date columns, try to parse as date
    if (headers[columnIndex].textContent.includes("Update") || headers[columnIndex].textContent.includes("Date")) {
      // Try to parse date format like "29 Oct 2025 09:45:12"
      const dateMatch = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthIndex = months.indexOf(dateMatch[2]);
        if (monthIndex !== -1) {
          const date = new Date(parseInt(dateMatch[3]), monthIndex, parseInt(dateMatch[1]), parseInt(dateMatch[4]), parseInt(dateMatch[5]), parseInt(dateMatch[6]));
          return date.getTime();
        }
      }
      return text;
    }

    // For number columns
    if (headers[columnIndex].textContent.includes("No") || headers[columnIndex].textContent.includes("Learners")) {
      const num = parseInt(text);
      return isNaN(num) ? text : num;
    }

    // Default to text
    return text.toLowerCase();
  }

  function sortTable(columnIndex) {
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Determine sort direction
    if (currentSort.column === columnIndex) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.column = columnIndex;
      currentSort.direction = "asc";
    }

    // Sort rows
    rows.sort((a, b) => {
      const aValue = getCellValue(a, columnIndex);
      const bValue = getCellValue(b, columnIndex);

      // Handle numeric comparison
      if (typeof aValue === "number" && typeof bValue === "number") {
        return currentSort.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      // Handle string comparison
      if (aValue < bValue) {
        return currentSort.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return currentSort.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    // Clear tbody and re-append sorted rows
    tbody.innerHTML = "";
    rows.forEach((row) => tbody.appendChild(row));

    // Update sort indicators
    updateSortIndicators();
  }

  function updateSortIndicators() {
    headers.forEach((header, index) => {
      if (header.textContent.includes("Actions")) return;

      const indicator = header.querySelector("[data-sort-indicator]");
      if (!indicator) return;

      if (currentSort.column === index) {
        indicator.textContent = currentSort.direction === "asc" ? "↑" : "↓";
        indicator.className = "ml-2 text-blue-400 inline-block";
      } else {
        indicator.textContent = "↕";
        indicator.className = "ml-2 text-slate-500 inline-block";
      }
    });
  }

  // Add click handlers to headers
  headers.forEach((header, index) => {
    if (header.textContent.includes("Actions")) return;

    header.addEventListener("click", () => {
      sortTable(index);
    });
  });

  // Initialize with no sort
  updateSortIndicators();
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // Initialize all tables on the page
    const tables = document.querySelectorAll("table");
    tables.forEach((table) => {
      initTableSort(table);
    });
  });
} else {
  // Initialize all tables on the page
  const tables = document.querySelectorAll("table");
  tables.forEach((table) => {
    initTableSort(table);
  });
}

