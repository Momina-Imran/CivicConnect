// API Configuration
const API_CONFIG = {
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
};

// Auto-adjust baseURL to avoid common mixed-content issues (http page -> https page)
if (typeof window !== 'undefined' && window.location && window.location.protocol && API_CONFIG.baseURL.startsWith('http://')) {
  try {
    // If page is served over https, switch baseURL to https to avoid browser blocking requests
    if (window.location.protocol === 'https:') {
      API_CONFIG.baseURL = API_CONFIG.baseURL.replace('http://', 'https://');
      console.info('[CivicConnectAPI] baseURL adjusted to secure protocol to avoid mixed content:', API_CONFIG.baseURL);
    }
  } catch (e) {
    // ignore
  }
}

// Timeout for network requests (ms)
const FETCH_TIMEOUT = 8000;

// Helper: fetch with timeout + consistent JSON parsing + improved error messages
async function fetchWithTimeout(url, options = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (controller) {
    options.signal = controller.signal;
  }

  const timeoutId = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT) : null;

  try {
    // Ensure CORS mode set so errors surface correctly
    options.mode = options.mode || 'cors';
    const resp = await fetch(url, options);
    if (timeoutId) clearTimeout(timeoutId);

    // Try parse JSON; if body empty, return empty object
    let data;
    try {
      data = await resp.json();
    } catch (err) {
      data = {};
    }

    if (!resp.ok) {
      const errMsg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${resp.status}`;
      const e = new Error(errMsg);
      e.status = resp.status;
      throw e;
    }

    return data;
  } catch (err) {
    // Handle AbortError from timeout
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${FETCH_TIMEOUT} ms`);
    }

    // Improve "Failed to fetch" / network type errors
    if (err instanceof TypeError || (err.message && err.message.toLowerCase().includes('failed to fetch'))) {
      throw new Error(`Failed to fetch ${url}. Possible causes: backend not running, wrong API base URL, mixed-content (http/https) or CORS blocking the request. Original error: ${err.message}`);
    }

    throw err;
  }
}

// Helper function to get auth token
const getToken = () => localStorage.getItem('token');

// Helper function to set auth header
const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

// API Helper Class
class CivicConnectAPI {
    
  // Ping server to check availability (tries /health then base URL)
  static async ping() {
    const tryUrls = [
      `${API_CONFIG.baseURL}/health`,
      API_CONFIG.baseURL
    ];
    let lastErr = null;
    for (const u of tryUrls) {
      try {
        // use GET and short timeout via fetchWithTimeout
        await fetchWithTimeout(u, { method: 'GET', headers: API_CONFIG.headers });
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Unable to reach API');
  }

  // ==================== AUTHENTICATION ====================

  // Register Citizen
  static async registerCitizen(userData) {
    const url = `${API_CONFIG.baseURL}/users/register`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: JSON.stringify(userData)
      });

      // Store token and user data
      if (data.token) localStorage.setItem('token', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', 'Citizen');

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Login Citizen
  static async loginCitizen(credentials) {
    const url = `${API_CONFIG.baseURL}/users/login`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: JSON.stringify(credentials)
      });

      if (data.token) localStorage.setItem('token', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', 'Citizen');

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Register NGO
  static async registerNGO(ngoData) {
    const url = `${API_CONFIG.baseURL}/ngo/register`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: JSON.stringify(ngoData)
      });

      if (data.token) localStorage.setItem('token', data.token);
      if (data.ngo) localStorage.setItem('ngo', JSON.stringify(data.ngo));
      localStorage.setItem('role', 'NGO');

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Login NGO
  static async loginNGO(credentials) {
    const url = `${API_CONFIG.baseURL}/ngo/login`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'POST',
        headers: API_CONFIG.headers,
        body: JSON.stringify(credentials)
      });

      if (data.token) localStorage.setItem('token', data.token);
      if (data.ngo) localStorage.setItem('ngo', JSON.stringify(data.ngo));
      localStorage.setItem('role', 'NGO');

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Logout
  static logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('ngo');
    localStorage.removeItem('role');
    window.location.href = 'index.html';
  }

  // Check if user is authenticated
  static isAuthenticated() {
    return !!getToken();
  }

  // Get current user
  static getCurrentUser() {
    const role = localStorage.getItem('role');
    if (role === 'Citizen') {
      return JSON.parse(localStorage.getItem('user'));
    } else if (role === 'NGO') {
      return JSON.parse(localStorage.getItem('ngo'));
    }
    return null;
  }

  // ==================== COMPLAINTS ====================

  // Submit Complaint
    // Submit Complaint
  static async submitComplaint(complaintData) {
    const url = `${API_CONFIG.baseURL}/complaints`;

    try {
      const headers = {
        Authorization: `Bearer ${getToken()}`
      };

      let body;

      if (complaintData instanceof FormData) {
        // FormData supports text fields and image uploads.
        // Do not set Content-Type manually; the browser adds the boundary.
        body = complaintData;
      } else {
        // Preserve support for ordinary JSON complaint objects.
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(complaintData);
      }

      return await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body
      });
    } catch (error) {
      throw error;
    }
  }

  // Get User's Complaints (Citizen)
  static async getUserComplaints() {
    const url = `${API_CONFIG.baseURL}/complaints/user`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Get NGO's Complaints
  static async getNGOComplaints() {
    const url = `${API_CONFIG.baseURL}/complaints/ngo`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Get Single Complaint
  static async getComplaint(id) {
    const url = `${API_CONFIG.baseURL}/complaints/${id}`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Update Complaint Status (NGO only)
  static async updateComplaintStatus(id, statusData) {
    const url = `${API_CONFIG.baseURL}/complaints/${id}`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(statusData)
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  // ==================== STATISTICS ====================

  // Get Statistics
  static async getStatistics() {
    const url = `${API_CONFIG.baseURL}/statistics`;
    try {
      const data = await fetchWithTimeout(url, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      return data;
    } catch (error) {
      throw error;
    }
  }
}

// Export for use in HTML files
if (typeof window !== 'undefined') {
  window.CivicConnectAPI = CivicConnectAPI;
}

// Example Usage:
/*

// In signup.html
citizenForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const userData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    };
    
    const result = await CivicConnectAPI.registerCitizen(userData);
    alert('Registration successful!');
    window.location.href = 'citizen_dashboard.html';
  } catch (error) {
    alert(error.message);
  }
});

// In login.html
citizenForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const credentials = {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    };
    
    const result = await CivicConnectAPI.loginCitizen(credentials);
    alert('Login successful!');
    window.location.href = 'citizen_dashboard.html';
  } catch (error) {
    alert(error.message);
  }
});

// In complain.html
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const complaintData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      contact: document.getElementById('contact').value,
      department: document.getElementById('department').value,
      subject: document.getElementById('subject').value,
      ngoType: document.getElementById('NGOs').value,
      description: document.getElementById('description').value,
      attachment: // base64 string from file input
    };
    
    const result = await CivicConnectAPI.submitComplaint(complaintData);
    alert('Complaint submitted successfully!');
    window.location.href = 'citizen_dashboard.html';
  } catch (error) {
    alert(error.message);
  }
});

// In citizen_dashboard.html
async function loadComplaints() {
  try {
    const complaints = await CivicConnectAPI.getUserComplaints();
    displayComplaints(complaints);
    
    const stats = await CivicConnectAPI.getStatistics();
    updateStats(stats);
  } catch (error) {
    console.error('Error loading complaints:', error);
  }
}

// In ngo_dashboard.html
async function loadNGOComplaints() {
  try {
    const complaints = await CivicConnectAPI.getNGOComplaints();
    displayComplaints(complaints);
  } catch (error) {
    console.error('Error loading complaints:', error);
  }
}

// Update complaint status
async function updateStatus(complaintId) {
  try {
    const statusData = {
      status: document.getElementById('status').value,
      remarks: document.getElementById('remarks').value
    };
    
    const result = await CivicConnectAPI.updateComplaintStatus(complaintId, statusData);
    alert('Status updated successfully!');
  } catch (error) {
    alert(error.message);
  }
}

*/