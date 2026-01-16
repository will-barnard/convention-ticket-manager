<template>
  <div class="webhooks">
    <PageHeader @change-password="showChangePassword" @logout="handleLogout" />

    <ChangePasswordModal v-if="isChangePasswordOpen" @close="isChangePasswordOpen = false" />

    <div class="container">
      <nav class="nav-tabs">
        <router-link to="/" class="nav-tab" exact-active-class="active">Dashboard</router-link>
        <router-link to="/tickets" class="nav-tab" active-class="active">Tickets</router-link>
        <router-link to="/stats" class="nav-tab" active-class="active">Stats</router-link>
        <router-link to="/settings" class="nav-tab" active-class="active">Settings</router-link>
        <router-link v-if="authStore.user?.role === 'superadmin'" to="/users" class="nav-tab" active-class="active">Users</router-link>
        <router-link v-if="authStore.user?.role === 'superadmin'" to="/webhooks" class="nav-tab" active-class="active">Webhooks</router-link>
        <router-link v-if="authStore.user?.role === 'superadmin'" to="/bulk-email" class="nav-tab" active-class="active">Bulk Email</router-link>
      </nav>

      <div class="page-content">
        <h1>📡 Webhook Logs</h1>
        <p class="page-description">View Shopify webhook activity and processing status</p>

        <!-- Statistics Cards -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-label">Total Webhooks</div>
            <div class="stat-value">{{ stats.total_webhooks || 0 }}</div>
          </div>
          <div class="stat-card success">
            <div class="stat-label">Processed</div>
            <div class="stat-value">{{ stats.processed_webhooks || 0 }}</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Unprocessed</div>
            <div class="stat-value">{{ stats.unprocessed_webhooks || 0 }}</div>
          </div>
          <div class="stat-card error">
            <div class="stat-label">With Errors</div>
            <div class="stat-value">{{ stats.webhooks_with_errors || 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Tickets Created</div>
            <div class="stat-value">{{ stats.total_tickets_created || 0 }}</div>
          </div>
        </div>

        <!-- Filters -->
        <div class="filters">
          <label>
            <input type="radio" v-model="filter" value="all" @change="fetchWebhooks" />
            All Webhooks
          </label>
          <label>
            <input type="radio" v-model="filter" value="processed" @change="fetchWebhooks" />
            Processed Only
          </label>
          <label>
            <input type="radio" v-model="filter" value="unprocessed" @change="fetchWebhooks" />
            Unprocessed Only
          </label>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading">Loading webhook logs...</div>

        <!-- Error State -->
        <div v-else-if="error" class="error-message">{{ error }}</div>

        <!-- Webhooks Table -->
        <div v-else class="card">
          <div v-if="webhooks.length === 0" class="no-webhooks">
            No webhook logs found
          </div>
          <table v-else class="webhooks-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Customer Name</th>
                <th>Order ID</th>
                <th>Tickets Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="webhook in webhooks" :key="webhook.id">
                <td>{{ formatDate(webhook.created_at) }}</td>
                <td>{{ getCustomerName(webhook) }}</td>
                <td>{{ webhook.shopify_order_id || '-' }}</td>
                <td>
                  <span class="ticket-count" :class="{ zero: webhook.tickets_created === 0 }">
                    {{ webhook.tickets_created || 0 }}
                  </span>
                </td>
                <td>
                  <span class="status-badge" :class="getStatusClass(webhook)">
                    {{ getStatusText(webhook) }}
                  </span>
                </td>
                <td>
                  <button @click="viewDetails(webhook)" class="btn-view">
                    View Details
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="selectedWebhook" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Webhook Details</h2>
          <button @click="closeModal" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <strong>Webhook ID:</strong>
            <span>{{ selectedWebhook.id }}</span>
          </div>
          <div class="detail-row">
            <strong>Received:</strong>
            <span>{{ formatDateFull(selectedWebhook.created_at) }}</span>
          </div>
          <div class="detail-row">
            <strong>Shopify Order ID:</strong>
            <span>{{ selectedWebhook.shopify_order_id || '-' }}</span>
          </div>
          <div class="detail-row">
            <strong>Status:</strong>
            <span class="status-badge" :class="getStatusClass(selectedWebhook)">
              {{ getStatusText(selectedWebhook) }}
            </span>
          </div>
          <div class="detail-row">
            <strong>Tickets Created:</strong>
            <span>{{ selectedWebhook.tickets_created || 0 }}</span>
          </div>
          <div v-if="selectedWebhook.processed_at" class="detail-row">
            <strong>Processed At:</strong>
            <span>{{ formatDateFull(selectedWebhook.processed_at) }}</span>
          </div>
          <div v-if="selectedWebhook.error_message" class="detail-row error">
            <strong>Error Message:</strong>
            <span>{{ selectedWebhook.error_message }}</span>
          </div>
          <div v-if="webhookDetails" class="detail-section">
            <strong>Raw Webhook Data:</strong>
            <pre class="json-display">{{ formatJSON(webhookDetails.webhook_data) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import ChangePasswordModal from '@/components/ChangePasswordModal.vue';
import PageHeader from '@/components/PageHeader.vue';

export default {
  name: 'Webhooks',
  components: {
    ChangePasswordModal,
    PageHeader,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();
    const isChangePasswordOpen = ref(false);

    const webhooks = ref([]);
    const stats = ref({});
    const loading = ref(false);
    const error = ref('');
    const filter = ref('all');
    const selectedWebhook = ref(null);
    const webhookDetails = ref(null);

    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/webhooks/stats/summary');
        stats.value = response.data;
      } catch (err) {
        console.error('Error fetching webhook stats:', err);
      }
    };

    const fetchWebhooks = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const params = {};
        if (filter.value === 'processed') {
          params.processed = 'true';
        } else if (filter.value === 'unprocessed') {
          params.processed = 'false';
        }
        
        const response = await axios.get('/api/webhooks', { params });
        webhooks.value = response.data.logs;
      } catch (err) {
        console.error('Error fetching webhooks:', err);
        error.value = 'Failed to load webhook logs';
      } finally {
        loading.value = false;
      }
    };

    const viewDetails = async (webhook) => {
      selectedWebhook.value = webhook;
      
      // Fetch full webhook details including JSON data
      try {
        const response = await axios.get(`/api/webhooks/${webhook.id}`);
        webhookDetails.value = response.data;
      } catch (err) {
        console.error('Error fetching webhook details:', err);
      }
    };

    const closeModal = () => {
      selectedWebhook.value = null;
      webhookDetails.value = null;
    };

    const getCustomerName = (webhook) => {
      // Try to extract customer name from webhook data (stored in the logs list endpoint doesn't include full data)
      // We'll need to show "-" here and display it in the details modal
      return '-';
    };

    const formatDate = (date) => {
      if (!date) return '-';
      return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    const formatDateFull = (date) => {
      if (!date) return '-';
      return new Date(date).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    };

    const getStatusClass = (webhook) => {
      if (webhook.error_message) return 'error';
      if (webhook.processed) return 'success';
      return 'pending';
    };

    const getStatusText = (webhook) => {
      if (webhook.error_message) return 'Error';
      if (webhook.processed) return 'Success';
      return 'Pending';
    };

    const formatJSON = (data) => {
      if (typeof data === 'string') {
        try {
          return JSON.stringify(JSON.parse(data), null, 2);
        } catch {
          return data;
        }
      }
      return JSON.stringify(data, null, 2);
    };

    const showChangePassword = () => {
      isChangePasswordOpen.value = true;
    };

    const handleLogout = () => {
      authStore.logout();
      router.push('/login');
    };

    onMounted(() => {
      authStore.initAuth();
      
      // Redirect if not superadmin
      if (authStore.user?.role !== 'superadmin') {
        router.push('/');
        return;
      }
      
      fetchStats();
      fetchWebhooks();
    });

    return {
      authStore,
      webhooks,
      stats,
      loading,
      error,
      filter,
      selectedWebhook,
      webhookDetails,
      isChangePasswordOpen,
      fetchWebhooks,
      viewDetails,
      closeModal,
      getCustomerName,
      formatDate,
      formatDateFull,
      getStatusClass,
      getStatusText,
      formatJSON,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.webhooks {
  min-height: 100vh;
  background: #f5f5f5;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 30px;
}

.nav-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
}

.nav-tab {
  padding: 12px 24px;
  text-decoration: none;
  color: #666;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
  font-weight: 500;
}

.nav-tab:hover {
  color: #667eea;
}

.nav-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.page-content {
  max-width: 1200px;
}

.page-content h1 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.page-description {
  color: #666;
  font-size: 1.1rem;
  margin-bottom: 2rem;
}

/* Statistics Row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}

.stat-card.success {
  border-left: 4px solid #28a745;
}

.stat-card.warning {
  border-left: 4px solid #ffc107;
}

.stat-card.error {
  border-left: 4px solid #dc3545;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
}

/* Filters */
.filters {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.filters label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  color: #555;
}

.filters input[type="radio"] {
  cursor: pointer;
}

/* Card */
.card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Table */
.webhooks-table {
  width: 100%;
  border-collapse: collapse;
}

.webhooks-table th,
.webhooks-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.webhooks-table th {
  background: #f5f5f5;
  font-weight: 600;
  color: #333;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.webhooks-table tr:hover {
  background: #f9f9f9;
}

.ticket-count {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #28a745;
  color: white;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.875rem;
}

.ticket-count.zero {
  background: #999;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
}

.status-badge.success {
  background: #d4edda;
  color: #155724;
}

.status-badge.error {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.pending {
  background: #fff3cd;
  color: #856404;
}

.btn-view {
  background: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.btn-view:hover {
  background: #5568d3;
}

.loading,
.error-message,
.no-webhooks {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.error-message {
  color: #dc3545;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-close:hover {
  background: #f5f5f5;
  color: #333;
}

.modal-body {
  padding: 1.5rem;
}

.detail-row {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-row strong {
  min-width: 150px;
  color: #555;
}

.detail-row.error {
  background: #fff5f5;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #f8d7da;
}

.detail-row.error span {
  color: #721c24;
}

.detail-section {
  margin-top: 1.5rem;
}

.detail-section strong {
  display: block;
  margin-bottom: 0.5rem;
  color: #555;
}

.json-display {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.5;
  border: 1px solid #e0e0e0;
  max-height: 400px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }

  .filters {
    flex-direction: column;
    gap: 1rem;
  }

  .nav-tabs {
    flex-wrap: wrap;
  }

  .nav-tab {
    padding: 10px 16px;
    font-size: 14px;
  }

  .webhooks-table {
    font-size: 0.875rem;
  }

  .webhooks-table th,
  .webhooks-table td {
    padding: 0.5rem;
  }
}
</style>
