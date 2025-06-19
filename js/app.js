let currentView = "tasks";
let currentViewMode = "list";

// DOM references for search and filter elements
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const priorityFilter = document.getElementById("priority-filter");
const sortOption = document.getElementById("sort-option");
// At top of loadTasks (or in a scope accessible to it):
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Event listeners for dynamic updates
searchInput.addEventListener("input", loadTasks);
searchBtn.addEventListener("click", loadTasks);
priorityFilter.addEventListener("change", loadTasks);
sortOption.addEventListener("change", loadTasks);

// Initialize app
window.addEventListener("load", async () => {
  if (await checkAuth()) {
    loadTasks();
  }
});

function showView(view) {
  // Hide all views
  document.querySelectorAll(".view").forEach((v) => {
    v.style.display = "none";
  });

  // Show selected view
  document.getElementById(`${view}-view`).style.display = "block";

  // Update nav buttons
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");

  currentView = view;

  // Load view data
  if (view === "tasks") {
    loadTasks();
  } else if (view === "admin" && currentUser.isAdmin) {
    loadAdminDashboard();
  }
}

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem("idToken");

  const response = await fetch(`${config.api.endpoint}${endpoint}`, {
    ...options,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }

  return response.json();
}

async function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const importStatus = document.getElementById("import-status");
  importStatus.textContent = "Processing...";

  try {
    const csvText = await file.text();
    const tasks = parseCSV(csvText);

    if (tasks.length === 0) {
      alert("No valid tasks found in CSV");
      importStatus.textContent = "";
      return;
    }

    // Send to bulk import endpoint
    const response = await apiCall("/tasks/bulk-import", {
      method: "POST",
      body: JSON.stringify({ tasks: tasks }),
    });

    importStatus.textContent = `✓ Queued ${tasks.length} tasks for import`;
    alert(`Successfully queued ${tasks.length} tasks for import. Administrators will be notified when complete.`);

    // Clear the file input
    event.target.value = "";

    // Refresh tasks after a delay
    setTimeout(() => {
      loadTasks();
      importStatus.textContent = "";
    }, 3000);
  } catch (error) {
    console.error("Import error:", error);
    alert("Error importing tasks");
    importStatus.textContent = "";
  }
}

function parseCSV(csvText) {
  const lines = csvText.split("\n");
  const tasks = [];

  // Skip header row if exists
  const startIndex = lines[0].toLowerCase().includes("title") ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle commas in quotes)
    const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];

    if (values.length >= 1) {
      const task = {
        title: values[0].replace(/"/g, ""),
        description: values[1] ? values[1].replace(/"/g, "") : "",
        priority: values[2]
          ? values[2].replace(/"/g, "").toLowerCase()
          : "medium",
        dueDate: values[3] ? values[3].replace(/"/g, "") : "",
      };

      // Validate priority
      if (!["low", "medium", "high"].includes(task.priority)) {
        task.priority = "medium";
      }

      tasks.push(task);
    }
  }

  return tasks;
}

// These functions for task completion and editing
async function completeTask(taskId) {
  try {
    await apiCall(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "completed" }),
    });
    loadTasks();
  } catch (error) {
    alert("Error completing task");
  }
}

// Add edit task modal functionality
function openEditModal(taskId) {
  const task = window.currentTasks.find((t) => t.taskId === taskId);
  if (!task) return;

  // Create modal HTML
  const modalHtml = `
        <div id="edit-modal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeEditModal()">&times;</span>
                <h2>Edit Task</h2>
                <form id="edit-task-form" onsubmit="updateTask(event, '${taskId}')">
                    <input type="text" id="edit-title" value="${
                      task.title
                    }" required>
                    <textarea id="edit-description" rows="4">${
                      task.description || ""
                    }</textarea>
                    <select id="edit-priority">
                        <option value="low" ${
                          task.priority === "low" ? "selected" : ""
                        }>Low</option>
                        <option value="medium" ${
                          task.priority === "medium" ? "selected" : ""
                        }>Medium</option>
                        <option value="high" ${
                          task.priority === "high" ? "selected" : ""
                        }>High</option>
                    </select>
                    <input type="date" id="edit-due-date" value="${
                      task.dueDate || ""
                    }">
                    <button type="submit" class="btn-primary">Update Task</button>
                </form>
            </div>
        </div>
    `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) modal.remove();
}

async function updateTask(event, taskId) {
  event.preventDefault();

  const taskData = {
    title: document.getElementById("edit-title").value,
    description: document.getElementById("edit-description").value,
    priority: document.getElementById("edit-priority").value,
    dueDate: document.getElementById("edit-due-date").value,
  };

  try {
    await apiCall(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(taskData),
    });
    closeEditModal();
    loadTasks();
    alert("Task updated successfully!");
  } catch (error) {
    alert("Error updating task");
  }
}

async function loadTasks() {
  const tasks = await apiCall("/tasks");
  window.currentTasks = tasks; // Store for editing
  const searchQuery = searchInput.value.toLowerCase();
  const selectedPriority = priorityFilter.value;
  const selectedSort = sortOption.value;

  // Filter based on search text
  let filteredTasks = tasks.filter((task) => {
    const titleMatch = task.title.toLowerCase().includes(searchQuery);
    const descriptionMatch = (task.description || "")
      .toLowerCase()
      .includes(searchQuery);
    const dueDateMatch = task.dueDate
      ? task.dueDate.includes(searchQuery)
      : false;
    return titleMatch || descriptionMatch || dueDateMatch;
  });

  // Filter by selected priority if not 'all'
  if (selectedPriority !== "all") {
    filteredTasks = filteredTasks.filter(
      (task) => task.priority === selectedPriority
    );
  }

  // Sort by priority first (high → medium → low), then by due date if present
  filteredTasks.sort((a, b) => {
    // 1. Compare priority
    const pa = PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER;
    const pb = PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) {
      return pa - pb;
    }
    // 2. Same priority: compare due date based on selectedSort
    if (a.dueDate && b.dueDate) {
      if (selectedSort === "closest") {
        // earlier date first
        return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
      } else {
        // farthest first
        return a.dueDate > b.dueDate ? -1 : a.dueDate < b.dueDate ? 1 : 0;
      }
    } else if (a.dueDate) {
      // if only a has due date: for closest-first, put a first; for farthest-first, put b first
      return selectedSort === "closest" ? -1 : 1;
    } else if (b.dueDate) {
      return selectedSort === "closest" ? 1 : -1;
    } else {
      return 0;
    }
  });

  // Build HTML for tasks
  const tasksHtml = filteredTasks
    .map((task) => {
      const isOverdue =
        task.dueDate &&
        new Date(task.dueDate) < new Date() &&
        task.status !== "completed";
      const isCompleted = task.status === "completed";
      let descriptionHtml;
      if (task.description && task.description.length > 200) {
        const truncated = task.description.substring(0, 200) + "...";
        descriptionHtml = `
                <p class="task-description truncated" id="description-${task.taskId}">${truncated}</p>
                <button class="see-more-btn" onclick="toggleDescription(this, '${task.taskId}')" aria-expanded="false" aria-controls="description-${task.taskId}">See more</button>
            `;
      } else {
        // Use the same class so wrapping applies
        descriptionHtml = `<p class="task-description">${
          task.description || "No description"
        }</p>`;
      }
      return `
                <div class="task-card ${task.priority}-priority ${
        isOverdue ? "overdue" : ""
      } ${isCompleted ? "completed" : ""}" data-task-id="${task.taskId}">
                    <h3>${task.title}</h3>
                    ${descriptionHtml}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                        <small>
                            Priority: ${task.priority} | 
                            Due: ${task.dueDate || "No due date"} |
                            Status: ${task.status}
                        </small>
                        <div class="task-actions">
                            <button onclick="completeTask('${
                              task.taskId
                            }')" class="btn-success" ${
        isCompleted ? "disabled" : ""
      }>
                                ${isCompleted ? "✓ Completed" : "Complete"}
                            </button>
                            <button onclick="openEditModal('${
                              task.taskId
                            }')" class="btn-edit">Edit</button>
                            <button onclick="deleteTask('${
                              task.taskId
                            }')" class="btn-danger">Delete</button>
                        </div>
                    </div>
                </div>
            `;
    })
    .join("");

  document.getElementById("tasks-list").innerHTML =
    tasksHtml || "<p>No tasks found.</p>";
}

async function exportTasks() {
  try {
    const tasks = await apiCall("/tasks");

    // Create CSV content with email
    const headers = [
      "Title",
      "Description",
      "Priority",
      "Due Date",
      "Status",
      "Created",
      "User Email",
    ];
    const rows = tasks.map((task) => [
      task.title,
      task.description || "",
      task.priority,
      task.dueDate || "",
      task.status,
      new Date(task.createdAt).toLocaleDateString(),
      task.userEmail || currentUser.email, // Include email for each task
    ]);

    let csvContent = headers.join(",") + "\n";
    rows.forEach((row) => {
      csvContent +=
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(cell).replace(/"/g, '""');
            return escaped.includes(",") ? `"${escaped}"` : escaped;
          })
          .join(",") + "\n";
    });

    // Download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskflow_tasks_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert("Error exporting tasks");
    console.error(error);
  }
}

// Dark mode functionality
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("darkMode", isDark);

  // Update button text/icon
  const darkModeBtn = document.getElementById("dark-mode-toggle");
  if (darkModeBtn) {
    darkModeBtn.textContent = isDark ? "☀️" : "🌙";
  }
}

// Check dark mode preference on load
window.addEventListener("load", () => {
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
    const darkModeBtn = document.getElementById("dark-mode-toggle");
    if (darkModeBtn) darkModeBtn.textContent = "☀️";
  }
});

async function toggleDescription(button, taskId) {
  const tasks = await apiCall("/tasks");
  const taskCard = document.querySelector(
    `.task-card[data-task-id="${taskId}"]`
  );
  const descriptionP = taskCard.querySelector(".task-description");
  const fullDescription = tasks.find(
    (task) => task.taskId === taskId
  ).description;
  if (descriptionP.classList.contains("truncated")) {
    descriptionP.textContent = fullDescription;
    descriptionP.classList.remove("truncated");
    button.textContent = "See less";
    button.setAttribute("aria-expanded", "true");
  } else {
    descriptionP.textContent = fullDescription.substring(0, 200) + "...";
    descriptionP.classList.add("truncated");
    button.textContent = "See more";
    button.setAttribute("aria-expanded", "false");
  }
}

function setView(view) {
  currentViewMode = view;
  const tasksContainer = document.getElementById("tasks-list");
  tasksContainer.classList.remove("list-view", "grid-view");
  tasksContainer.classList.add(`${view}-view`);
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");
}

async function deleteTask(taskId) {
  if (!confirm("Are you sure you want to delete this task?")) {
    return;
  }

  try {
    await apiCall(`/tasks/${taskId}`, { method: "DELETE" });
    loadTasks();
  } catch (error) {
    alert("Error deleting task");
  }
}

// Task form handler
document.getElementById("task-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const taskData = {
    title: document.getElementById("task-title").value,
    description: document.getElementById("task-description").value,
    priority: document.getElementById("task-priority").value,
    dueDate: document.getElementById("task-due-date").value,
  };

  try {
    await apiCall("/tasks", {
      method: "POST",
      body: JSON.stringify(taskData),
    });

    alert("Task created successfully!");
    document.getElementById("task-form").reset();
    showView("tasks");
  } catch (error) {
    //alert('Error creating task');
    console.error(error);
  }
});

async function loadAdminDashboard() {
  if (!currentUser.isAdmin) return;

  try {
    const stats = await apiCall("/admin/analytics");

    // Display statistics text (excluding priority - shown in chart)
    document.getElementById("stats-text").innerHTML = `
            <p>Total Tasks: ${stats.totalTasks}</p>
            <h4>Tasks by Status:</h4>
            ${Object.entries(stats.tasksByStatus || {})
              .map(([status, count]) => `<p>${status}: ${count}</p>`)
              .join("")}
        `;

    // Create CSS donut chart for priorities
    createCSSDonutChart(stats.tasksByPriority || {});

    // Rest of your existing code...
    // Display recent activity
    document.getElementById("activity").innerHTML =
      stats.recentTasks
        .slice(0, 5)
        .map(
          (task) => `
            <div class="activity-item" style="padding: 14px; margin-bottom: 12px; border-radius: 10px; background: #f8fafc; border-left: 3px solid #667eea; transition: all 0.2s;">
                <strong style="color: #1e293b; font-size: 14px;">${
                  task.title
                }</strong>
                <br><span style="color: #475569; font-size: 13px;">by ${
                  task.userEmail
                }</span>
                <br><small style="color: #94a3b8; font-size: 12px;">${new Date(
                  task.createdAt
                ).toLocaleString()}</small>
            </div>
        `
        )
        .join("") ||
      "<p style='color: #94a3b8; text-align: center; padding: 20px;'>No recent activity</p>";

    // Store all tasks for search
    window.allAdminTasks = stats.recentTasks || [];

    // Display all tasks
    displayAdminTasks(window.allAdminTasks);

    // Add search event listener
    const searchInput = document.getElementById("admin-task-search");
    if (searchInput) {
      searchInput.addEventListener("input", function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const filteredTasks = window.allAdminTasks.filter((task) => {
          const titleMatch = (task.title || "")
            .toLowerCase()
            .includes(searchTerm);
          const emailMatch = (task.userEmail || "")
            .toLowerCase()
            .includes(searchTerm);
          const descriptionMatch = (task.description || "")
            .toLowerCase()
            .includes(searchTerm);
          return titleMatch || emailMatch || descriptionMatch;
        });
        displayAdminTasks(filteredTasks);
      });
    }
  } catch (error) {
    console.error("Error loading admin dashboard:", error);
  }
}

// Function to display admin tasks with search and see more/less
function displayAdminTasks(tasks) {
  const container = document.getElementById("all-tasks");

  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📋</div>
                <p class="no-results-text">No tasks found</p>
            </div>
        `;
    return;
  }

  container.innerHTML = `<div class="all-tasks-container">${tasks
    .map((task) => {
      let descriptionHtml = "";
      if (task.description) {
        if (task.description.length > 200) {
          const truncated = task.description.substring(0, 200) + "...";
          descriptionHtml = `
                            <p class="admin-task-description truncated" id="admin-desc-${task.taskId}">${truncated}</p>
                            <button class="see-more-btn" onclick="toggleAdminDescription('${task.taskId}')" data-expanded="false">See more</button>
                        `;
        } else {
          descriptionHtml = `<p class="admin-task-description">${task.description}</p>`;
        }
      }

      return `
                    <div class="admin-task-item" data-task-id="${
                      task.taskId
                    }" data-full-description="${encodeURIComponent(
        task.description || ""
      )}">
                        <div class="admin-task-title">${task.title}</div>
                        ${descriptionHtml}
                        <div class="admin-task-meta">
                            <div class="admin-task-user">
                                <span style="display: flex; align-items: center; gap: 6px;">
                                    <span>👤</span>
                                    <span class="admin-task-email">${
                                      task.userEmail
                                    }</span>
                                </span>
                                <span class="admin-task-date">${new Date(
                                  task.createdAt
                                ).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `;
    })
    .join("")}</div>`;
}

// Toggle description for admin tasks
function toggleAdminDescription(taskId) {
  const taskCard = document.querySelector(
    `.admin-task-item[data-task-id="${taskId}"]`
  );
  const descriptionP = taskCard.querySelector(".admin-task-description");
  const button = taskCard.querySelector(".see-more-btn");
  const fullDescription = decodeURIComponent(
    taskCard.getAttribute("data-full-description")
  );

  if (button.getAttribute("data-expanded") === "false") {
    descriptionP.textContent = fullDescription;
    descriptionP.classList.remove("truncated");
    button.textContent = "See less";
    button.setAttribute("data-expanded", "true");
  } else {
    descriptionP.textContent = fullDescription.substring(0, 200) + "...";
    descriptionP.classList.add("truncated");
    button.textContent = "See more";
    button.setAttribute("data-expanded", "false");
  }
}

// Modern donut chart function
function createCSSDonutChart(data) {
  const container = document.querySelector(".donut-chart-wrapper");
  if (!container) return;

  // Calculate total
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);

  if (total === 0) {
    container.innerHTML = `
            <div class="donut-chart empty-state">
                <div class="donut-center">
                    <span class="total-count">0</span>
                    <span class="total-label">No tasks</span>
                </div>
            </div>
        `;
    return;
  }

  // Calculate percentages and angles
  const percentages = {
    high: Math.round(((data.high || 0) / total) * 100),
    medium: Math.round(((data.medium || 0) / total) * 100),
    low: Math.round(((data.low || 0) / total) * 100),
  };

  // Calculate cumulative angles
  const highAngle = (percentages.high / 100) * 360;
  const mediumAngle = highAngle + (percentages.medium / 100) * 360;

  // Create the donut chart HTML
  container.innerHTML = `
        <div class="donut-chart" 
             style="--high-angle: ${highAngle}deg; 
                    --medium-angle: ${mediumAngle}deg;
                    --high-percentage: ${percentages.high};
                    --medium-percentage: ${percentages.medium};
                    --low-percentage: ${percentages.low};">
            <div class="donut-center">
                <span class="total-count">${total}</span>
                <span class="total-label">tasks</span>
            </div>
            ${
              data.high > 0
                ? `
                <div class="donut-segment high-segment"></div>
            `
                : ""
            }
            ${
              data.medium > 0
                ? `
                <div class="donut-segment medium-segment"></div>
            `
                : ""
            }
            ${
              data.low > 0
                ? `
                <div class="donut-segment low-segment"></div>
            `
                : ""
            }
        </div>
    `;

  // Create legend
  const legendContainer = document.getElementById("chart-legend");
  if (legendContainer) {
    const colors = {
      high: "#ef4444",
      medium: "#f59e0b",
      low: "#10b981",
    };

    legendContainer.innerHTML = ["high", "medium", "low"]
      .filter((priority) => data[priority] > 0)
      .map(
        (priority) => `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${
                      colors[priority]
                    }"></div>
                    <span class="legend-text">${
                      priority.charAt(0).toUpperCase() + priority.slice(1)
                    }</span>
                    <span class="legend-count">(${data[priority] || 0})</span>
                </div>
            `
      )
      .join("");
  }
}

// Helper function to calculate clip paths for hover areas
function getClipPath(priority, percentages) {
  const startAngle =
    priority === "high"
      ? -90
      : priority === "medium"
      ? -90 + percentages.high * 3.6
      : -90 + (percentages.high + percentages.medium) * 3.6;
  const endAngle =
    priority === "high"
      ? startAngle + percentages.high * 3.6
      : priority === "medium"
      ? startAngle + percentages.medium * 3.6
      : startAngle + percentages.low * 3.6;

  // This is a simplified approach - for production, you'd calculate precise polygon points
  return "none"; // Let CSS handle the default clip-paths
}

// Add danger button style
const style = document.createElement("style");
style.textContent = `
    .btn-danger {
        background: #e53e3e;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-danger:hover {
        background: #c53030;
    }
`;
document.head.appendChild(style);
