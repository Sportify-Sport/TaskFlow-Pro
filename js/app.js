let currentView = 'tasks';
let currentViewMode = 'list';

// DOM references for search and filter elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const priorityFilter = document.getElementById('priority-filter');
const sortOption = document.getElementById('sort-option');

// Event listeners for dynamic updates
searchInput.addEventListener('input', renderTasks);
searchBtn.addEventListener('click', renderTasks);
priorityFilter.addEventListener('change', renderTasks);
sortOption.addEventListener('change', renderTasks);

// Initialize app
window.addEventListener('load', async () => {
    if (await checkAuth()) {
        loadTasks();
    }
});

function showView(view) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
    });
    
    // Show selected view
    document.getElementById(`${view}-view`).style.display = 'block';
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    currentView = view;
    
    // Load view data
    if (view === 'tasks') {
        loadTasks();
    } else if (view === 'admin' && currentUser.isAdmin) {
        loadAdminDashboard();
    }
}

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('idToken');
    
    const response = await fetch(`${config.api.endpoint}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
    }
    
    return response.json();
}

function loadTasks() {
    const searchQuery = searchInput.value.toLowerCase();
    const selectedPriority = priorityFilter.value;
    const selectedSort = sortOption.value;

    let filteredTasks = mockTasks.filter(task => {
        const titleMatch = task.title.toLowerCase().includes(searchQuery);
        const descriptionMatch = task.description.toLowerCase().includes(searchQuery);
        const dueDateMatch = task.dueDate && task.dueDate.includes(searchQuery);
        return titleMatch || descriptionMatch || dueDateMatch;
    });

    if (selectedPriority !== 'all') {
        filteredTasks = filteredTasks.filter(task => task.priority === selectedPriority);
    }

    filteredTasks.sort((a, b) => {
        if (selectedSort === 'closest') {
            if (a.dueDate && b.dueDate) {
                return a.dueDate < b.dueDate ? -1 : 1;
            } else if (a.dueDate) {
                return -1;
            } else if (b.dueDate) {
                return 1;
            } else {
                return 0;
            }
        } else { // farthest
            if (a.dueDate && b.dueDate) {
                return a.dueDate > b.dueDate ? -1 : 1;
            } else if (a.dueDate) {
                return 1;
            } else if (b.dueDate) {
                return -1;
            } else {
                return 0;
            }
        }
    });

    const tasksHtml = filteredTasks.map(task => {
        let descriptionHtml;
        if (task.description && task.description.length > 200) {
            const truncated = task.description.substring(0, 200) + '...';
            descriptionHtml = `
                <p class="task-description truncated" id="description-${task.taskId}">${truncated}</p>
                <button class="see-more-btn" onclick="toggleDescription(this, '${task.taskId}')" aria-expanded="false" aria-controls="description-${task.taskId}">See more</button>
            `;
        } else {
            descriptionHtml = `<p class="task-description">${task.description || 'No description'}</p>`;
        }
        return `
            <div class="task-card ${task.priority}-priority" data-task-id="${task.taskId}">
                <h3>${task.title}</h3>
                ${descriptionHtml}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <small>
                        Priority: ${task.priority} | 
                        Due: ${task.dueDate || 'No due date'} |
                        Status: ${task.status}
                    </small>
                    <button onclick="deleteTask('${task.taskId}')" class="btn-danger">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('tasks-list').innerHTML = tasksHtml || '<p>No tasks found.</p>';
}

function toggleDescription(button, taskId) {
    const taskCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    const descriptionP = taskCard.querySelector('.task-description');
    const fullDescription = mockTasks.find(task => task.taskId === taskId).description;
    if (descriptionP.classList.contains('truncated')) {
        descriptionP.textContent = fullDescription;
        descriptionP.classList.remove('truncated');
        button.textContent = 'See less';
        button.setAttribute('aria-expanded', 'true');
    } else {
        descriptionP.textContent = fullDescription.substring(0, 200) + '...';
        descriptionP.classList.add('truncated');
        button.textContent = 'See more';
        button.setAttribute('aria-expanded', 'false');
    }
}

function setView(view) {
    currentViewMode = view;
    const tasksContainer = document.getElementById('tasks-list');
    tasksContainer.classList.remove('list-view', 'grid-view');
    tasksContainer.classList.add(`${view}-view`);
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    try {
        await apiCall(`/tasks/${taskId}`, { method: 'DELETE' });
        loadTasks();
    } catch (error) {
        alert('Error deleting task');
    }
}

// Task form handler
document.getElementById('task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const taskData = {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        priority: document.getElementById('task-priority').value,
        dueDate: document.getElementById('task-due-date').value
    };
    
    try {
        await apiCall('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
        
        alert('Task created successfully!');
        document.getElementById('task-form').reset();
        showView('tasks');
    } catch (error) {
        //alert('Error creating task');
        console.error(error);
    }
});

async function loadAdminDashboard() {
    if (!currentUser.isAdmin) return;
    
    try {
        const stats = await apiCall('/admin/analytics');
        
        // Display statistics
        document.getElementById('stats').innerHTML = `
            <p>Total Tasks: ${stats.totalTasks}</p>
            <h4>Tasks by Status:</h4>
            ${Object.entries(stats.tasksByStatus || {}).map(([status, count]) => 
                `<p>${status}: ${count}</p>`
            ).join('')}
            <h4>Tasks by Priority:</h4>
            ${Object.entries(stats.tasksByPriority || {}).map(([priority, count]) => 
                `<p>${priority}: ${count}</p>`
            ).join('')}
        `;
        
        // Display recent tasks
        document.getElementById('all-tasks').innerHTML = stats.recentTasks.map(task => `
            <div class="task-card">
                <h4>${task.title}</h4>
                <p>User: ${task.userEmail}</p>
                <small>Created: ${new Date(task.createdAt).toLocaleString()}</small>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
    }
}

// Add danger button style
const style = document.createElement('style');
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
