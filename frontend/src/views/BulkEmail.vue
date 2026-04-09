<template>
  <div class="bulk-email">
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

      <div class="page-header">
        <h1>📧 Bulk Email</h1>
        <p class="subtitle">Send emails to ticket holders</p>
      </div>

      <!-- Email Provider -->
      <div class="section">
        <h2>Sending Provider</h2>
        <div v-if="availableProviders.length === 0" class="result-message error">
          No email providers are configured. Add <code>RESEND_API_KEY</code> or <code>GMAIL_USER</code> / <code>GMAIL_APP_PASSWORD</code> to your environment.
        </div>
        <div v-else class="provider-selection">
          <label
            v-for="p in availableProviders"
            :key="p"
            class="provider-label"
            :class="{ selected: selectedProvider === p }"
          >
            <input type="radio" :value="p" v-model="selectedProvider" />
            <span v-if="p === 'resend'">✉️ Resend</span>
            <span v-else-if="p === 'gmail'">📬 Gmail (App Password)</span>
            <span v-else>{{ p }}</span>
          </label>
        </div>
      </div>

      <!-- Ticket Type Selection -->
      <div class="section">
        <h2>Recipients</h2>
        <div class="ticket-type-selection">
          <label class="checkbox-label">
            <input type="checkbox" v-model="selectAll" @change="handleSelectAll" />
            <span class="checkbox-text">All Ticket Holders</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" value="student" v-model="selectedTypes" :disabled="selectAll" />
            <span class="checkbox-text">Students</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" value="exhibitor" v-model="selectedTypes" :disabled="selectAll" />
            <span class="checkbox-text">Exhibitors</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" value="attendee" v-model="selectedTypes" :disabled="selectAll" />
            <span class="checkbox-text">Attendees</span>
          </label>
        </div>

        <button
          @click="loadPreview"
          class="btn-secondary"
          :disabled="selectedTypes.length === 0"
          style="margin-top: 1rem;"
        >
          Load Recipient List
        </button>

        <!-- Individual Recipient Table -->
        <div v-if="previewRecipients.length > 0" class="recipient-table-container">
          <div class="recipient-table-header">
            <h3>📋 Select Recipients</h3>
            <div class="recipient-table-actions">
              <button class="btn-xs" @click="selectAllRecipients">Select All</button>
              <button class="btn-xs" @click="deselectAllRecipients">Deselect All</button>
              <span class="selected-count">{{ selectedRecipients.length }} / {{ previewRecipients.length }} selected</span>
            </div>
          </div>

          <!-- Per-type select/deselect shortcuts -->
          <div class="type-shortcuts">
            <span
              v-for="type in presentTypes"
              :key="type"
              class="type-shortcut"
            >
              {{ formatTicketType(type) }}:
              <button class="btn-xxs" @click="selectByType(type)">all</button>
              <button class="btn-xxs btn-xxs-danger" @click="deselectByType(type)">none</button>
            </span>
          </div>

          <div class="recipient-table-scroll">
            <table class="recipient-table">
              <thead>
                <tr>
                  <th style="width:2.5rem;"></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in previewRecipients"
                  :key="r.email"
                  :class="{ 'row-selected': selectedRecipients.includes(r.email) }"
                  @click="toggleRecipient(r.email)"
                >
                  <td>
                    <input
                      type="checkbox"
                      :checked="selectedRecipients.includes(r.email)"
                      @click.stop="toggleRecipient(r.email)"
                    />
                  </td>
                  <td>{{ r.name }}</td>
                  <td>{{ r.email }}</td>
                  <td><span :class="['type-badge', r.ticket_type]">{{ formatTicketType(r.ticket_type) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Email Composition -->
      <div class="section">
        <h2>Email Content</h2>
        <div class="form-group">
          <label>Subject *</label>
          <input
            v-model="subject"
            type="text"
            placeholder="Email subject line"
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label>Message Body * (HTML supported)</label>
          <textarea
            v-model="body"
            rows="12"
            placeholder="Enter your message here. You can use HTML for formatting."
            class="form-textarea"
          ></textarea>
          <p class="hint">
            Tip: Use HTML tags like &lt;strong&gt;, &lt;em&gt;, &lt;p&gt;, &lt;br&gt;, &lt;ul&gt;, &lt;li&gt; for formatting
          </p>
        </div>
      </div>

      <!-- Test Email -->
      <div class="section">
        <h2>🧪 Test Email</h2>
        <p class="description">Send a test email to verify formatting before sending to all recipients</p>

        <div class="form-group">
          <label>Test Email Address *</label>
          <input
            v-model="testEmail"
            type="email"
            placeholder="your.email@example.com"
            class="form-input"
          />
        </div>

        <button
          @click="sendTestEmail"
          class="btn-test"
          :disabled="!canSendTest || sendingTest"
        >
          {{ sendingTest ? 'Sending Test...' : 'Send Test Email' }}
        </button>

        <div v-if="testResult" :class="['result-message', testResult.type]">
          {{ testResult.message }}
        </div>
      </div>

      <!-- Send Bulk Email -->
      <div class="section">
        <h2>⚠️ Send Bulk Email</h2>
        <p class="description warning">
          This will send the email to the {{ selectedRecipients.length }} selected recipient(s). This action cannot be undone.
          Emails are sent at a rate of 10 per minute to comply with rate limits.
        </p>

        <button
          @click="confirmSend"
          class="btn-send"
          :disabled="!canSendBulk || sending"
        >
          {{ sending ? 'Sending...' : `Send to ${selectedRecipients.length} Recipient(s)` }}
        </button>

        <div v-if="sendResult" :class="['result-message', sendResult.type]">
          {{ sendResult.message }}
        </div>

        <div v-if="sending" class="progress-info">
          <p>⏳ Sending emails... This may take several minutes.</p>
          <p>Please do not close this page.</p>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div v-if="showConfirmModal" class="modal-overlay" @click="showConfirmModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>⚠️ Confirm Bulk Email</h2>
          <button @click="showConfirmModal = false" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <p><strong>You are about to send this email to {{ selectedRecipients.length }} recipient(s) via {{ selectedProvider }}.</strong></p>
          <p>Subject: <em>{{ subject }}</em></p>
          <p>This action cannot be undone. Are you sure you want to continue?</p>
        </div>
        <div class="modal-footer">
          <button @click="showConfirmModal = false" class="btn-secondary">Cancel</button>
          <button @click="sendBulkEmail" class="btn-danger">Yes, Send Email</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import ChangePasswordModal from '@/components/ChangePasswordModal.vue';
import PageHeader from '@/components/PageHeader.vue';

export default {
  name: 'BulkEmail',
  components: {
    ChangePasswordModal,
    PageHeader,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const isChangePasswordOpen = ref(false);
    const selectAll = ref(false);
    const selectedTypes = ref([]);
    const subject = ref('');
    const body = ref('');
    const testEmail = ref('');
    const previewRecipients = ref([]);
    const selectedRecipients = ref([]);
    const sendingTest = ref(false);
    const sending = ref(false);
    const testResult = ref(null);
    const sendResult = ref(null);
    const showConfirmModal = ref(false);
    const availableProviders = ref([]);
    const selectedProvider = ref('resend');

    // Unique ticket types present in the current preview list
    const presentTypes = computed(() => {
      const types = new Set(previewRecipients.value.map(r => r.ticket_type));
      return [...types];
    });

    const canSendTest = computed(() => {
      return subject.value.trim() && body.value.trim() && testEmail.value.trim() && selectedProvider.value;
    });

    const canSendBulk = computed(() => {
      return subject.value.trim() && body.value.trim() && selectedRecipients.value.length > 0 && selectedProvider.value;
    });

    // Fetch which providers are available from the backend
    const loadProviders = async () => {
      try {
        const response = await axios.get('/api/bulk-email/providers');
        availableProviders.value = response.data.providers;
        if (availableProviders.value.length > 0) {
          selectedProvider.value = availableProviders.value[0];
        }
      } catch (error) {
        console.error('Error loading providers:', error);
      }
    };

    const handleSelectAll = () => {
      if (selectAll.value) {
        selectedTypes.value = ['student', 'exhibitor', 'attendee'];
      } else {
        selectedTypes.value = [];
      }
      previewRecipients.value = [];
      selectedRecipients.value = [];
    };

    const loadPreview = async () => {
      try {
        const types = selectAll.value ? ['student', 'exhibitor', 'attendee'] : selectedTypes.value;
        const response = await axios.post('/api/bulk-email/preview', { ticketTypes: types });
        previewRecipients.value = response.data.recipients;
        // Default: select all
        selectedRecipients.value = response.data.recipients.map(r => r.email);
      } catch (error) {
        console.error('Error loading preview:', error);
        alert('Failed to load recipient list');
      }
    };

    const toggleRecipient = (email) => {
      const idx = selectedRecipients.value.indexOf(email);
      if (idx === -1) {
        selectedRecipients.value.push(email);
      } else {
        selectedRecipients.value.splice(idx, 1);
      }
    };

    const selectAllRecipients = () => {
      selectedRecipients.value = previewRecipients.value.map(r => r.email);
    };

    const deselectAllRecipients = () => {
      selectedRecipients.value = [];
    };

    const selectByType = (type) => {
      const emails = previewRecipients.value.filter(r => r.ticket_type === type).map(r => r.email);
      const combined = new Set([...selectedRecipients.value, ...emails]);
      selectedRecipients.value = [...combined];
    };

    const deselectByType = (type) => {
      const emailsOfType = new Set(
        previewRecipients.value.filter(r => r.ticket_type === type).map(r => r.email)
      );
      selectedRecipients.value = selectedRecipients.value.filter(e => !emailsOfType.has(e));
    };

    const sendTestEmail = async () => {
      sendingTest.value = true;
      testResult.value = null;

      try {
        const response = await axios.post('/api/bulk-email/test', {
          subject: subject.value,
          body: body.value,
          testEmail: testEmail.value,
          provider: selectedProvider.value,
        });

        testResult.value = {
          type: 'success',
          message: response.data.message,
        };
      } catch (error) {
        console.error('Error sending test email:', error);
        testResult.value = {
          type: 'error',
          message: error.response?.data?.error || 'Failed to send test email',
        };
      } finally {
        sendingTest.value = false;
      }
    };

    const confirmSend = () => {
      showConfirmModal.value = true;
    };

    const sendBulkEmail = async () => {
      showConfirmModal.value = false;
      sending.value = true;
      sendResult.value = null;

      try {
        const response = await axios.post('/api/bulk-email/send', {
          subject: subject.value,
          body: body.value,
          recipients: selectedRecipients.value,
          provider: selectedProvider.value,
        });

        sendResult.value = {
          type: 'success',
          message: `✅ Email sent successfully! ${response.data.sent} sent, ${response.data.failed} failed`,
        };

        if (response.data.sent > 0) {
          subject.value = '';
          body.value = '';
          previewRecipients.value = [];
          selectedRecipients.value = [];
        }
      } catch (error) {
        console.error('Error sending bulk email:', error);
        sendResult.value = {
          type: 'error',
          message: error.response?.data?.error || 'Failed to send bulk email',
        };
      } finally {
        sending.value = false;
      }
    };

    const formatTicketType = (type) => {
      const labels = {
        student: 'Students',
        exhibitor: 'Exhibitors',
        attendee: 'Attendees',
      };
      return labels[type] || type;
    };

    const showChangePassword = () => {
      isChangePasswordOpen.value = true;
    };

    const handleLogout = () => {
      authStore.logout();
      router.push('/login');
    };

    onMounted(loadProviders);

    return {
      authStore,
      isChangePasswordOpen,
      selectAll,
      selectedTypes,
      subject,
      body,
      testEmail,
      previewRecipients,
      selectedRecipients,
      presentTypes,
      sendingTest,
      sending,
      testResult,
      sendResult,
      showConfirmModal,
      availableProviders,
      selectedProvider,
      canSendTest,
      canSendBulk,
      handleSelectAll,
      loadPreview,
      toggleRecipient,
      selectAllRecipients,
      deselectAllRecipients,
      selectByType,
      deselectByType,
      sendTestEmail,
      confirmSend,
      sendBulkEmail,
      formatTicketType,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.bulk-email {
  min-height: 100vh;
  background: #f5f5f5;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.nav-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
  overflow-x: auto;
}

.nav-tab {
  padding: 12px 24px;
  text-decoration: none;
  color: #666;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  font-weight: 500;
  white-space: nowrap;
}

.nav-tab:hover {
  color: #667eea;
}

.nav-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.subtitle {
  color: #666;
  font-size: 1rem;
}

.section {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #333;
  font-size: 1.3rem;
}

.description {
  color: #666;
  margin-bottom: 1rem;
  line-height: 1.6;
}

.description.warning {
  color: #d32f2f;
  font-weight: 500;
}

/* Provider selection */
.provider-selection {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.provider-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.provider-label.selected {
  border-color: #667eea;
  background: #f0f0ff;
  color: #667eea;
}

.provider-label input[type="radio"] {
  accent-color: #667eea;
}

/* Ticket type checkboxes */
.ticket-type-selection {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-text {
  font-weight: 500;
  color: #333;
}

/* Recipient table */
.recipient-table-container {
  margin-top: 1.5rem;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
}

.recipient-table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.recipient-table-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #333;
}

.recipient-table-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.selected-count {
  font-size: 0.85rem;
  color: #666;
  font-weight: 600;
}

.type-shortcuts {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 0.85rem;
  color: #555;
  align-items: center;
}

.type-shortcut {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.recipient-table-scroll {
  max-height: 380px;
  overflow-y: auto;
}

.recipient-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.recipient-table thead th {
  position: sticky;
  top: 0;
  background: #f8f9fa;
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #555;
  border-bottom: 1px solid #dee2e6;
}

.recipient-table tbody tr {
  cursor: pointer;
  transition: background 0.1s;
}

.recipient-table tbody tr:hover {
  background: #f0f4ff;
}

.recipient-table tbody tr.row-selected {
  background: #eef0ff;
}

.recipient-table tbody td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f0f0f0;
  color: #333;
}

.type-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.type-badge.student {
  background: #e3f2fd;
  color: #1565c0;
}

.type-badge.exhibitor {
  background: #f3e5f5;
  color: #6a1b9a;
}

.type-badge.attendee {
  background: #e8f5e9;
  color: #2e7d32;
}

/* Form */
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-textarea {
  resize: vertical;
  min-height: 200px;
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #999;
  font-style: italic;
}

/* Buttons */
.btn-secondary,
.btn-test,
.btn-send,
.btn-danger {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-secondary:hover:not(:disabled) {
  background: #f0f0ff;
}

.btn-xs {
  padding: 0.2rem 0.6rem;
  border: 1px solid #667eea;
  border-radius: 4px;
  background: white;
  color: #667eea;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-xs:hover {
  background: #f0f0ff;
}

.btn-xxs {
  padding: 0.1rem 0.4rem;
  border: 1px solid #667eea;
  border-radius: 3px;
  background: white;
  color: #667eea;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-xxs:hover {
  background: #f0f0ff;
}

.btn-xxs-danger {
  border-color: #e53935;
  color: #e53935;
}

.btn-xxs-danger:hover {
  background: #fff0f0;
}

.btn-test {
  background: #ff9800;
  color: white;
}

.btn-test:hover:not(:disabled) {
  background: #f57c00;
}

.btn-send {
  background: #4caf50;
  color: white;
}

.btn-send:hover:not(:disabled) {
  background: #45a049;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-message {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 6px;
  font-weight: 500;
}

.result-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.result-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.progress-info {
  margin-top: 1rem;
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  color: #856404;
}

.progress-info p {
  margin: 0.5rem 0;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
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
  cursor: pointer;
  color: #999;
  line-height: 1;
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.btn-close:hover {
  color: #333;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0.75rem 0;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding: 1.5rem;
  border-top: 1px solid #e0e0e0;
}

@media (max-width: 768px) {
  .container {
    padding: 15px;
  }

  .section {
    padding: 1.5rem;
  }

  .nav-tabs {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar {
    display: none;
  }

  .recipient-table-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.nav-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
  overflow-x: auto;
}

.nav-tab {
  padding: 12px 24px;
  text-decoration: none;
  color: #666;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  font-weight: 500;
  white-space: nowrap;
}

.nav-tab:hover {
  color: #667eea;
}

.nav-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.subtitle {
  color: #666;
  font-size: 1rem;
}

.section {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #333;
  font-size: 1.3rem;
}

.description {
  color: #666;
  margin-bottom: 1rem;
  line-height: 1.6;
}

.description.warning {
  color: #d32f2f;
  font-weight: 500;
}

.ticket-type-selection {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-text {
  font-weight: 500;
  color: #333;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-textarea {
  resize: vertical;
  min-height: 200px;
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #999;
  font-style: italic;
}

.preview-box {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #dee2e6;
}

.preview-box h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #333;
  font-size: 1.1rem;
}

.preview-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
}

.stat-item.total {
  background: #667eea;
  color: white;
  font-weight: 600;
  margin-top: 0.5rem;
}

.stat-label {
  font-weight: 500;
}

.stat-value {
  font-weight: 600;
}

.btn-secondary,
.btn-test,
.btn-send,
.btn-danger {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-secondary:hover:not(:disabled) {
  background: #f0f0ff;
}

.btn-test {
  background: #ff9800;
  color: white;
}

.btn-test:hover:not(:disabled) {
  background: #f57c00;
}

.btn-send {
  background: #4caf50;
  color: white;
}

.btn-send:hover:not(:disabled) {
  background: #45a049;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-message {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 6px;
  font-weight: 500;
}

.result-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.result-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.progress-info {
  margin-top: 1rem;
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  color: #856404;
}

.progress-info p {
  margin: 0.5rem 0;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
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
  cursor: pointer;
  color: #999;
  line-height: 1;
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.btn-close:hover {
  color: #333;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0.75rem 0;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding: 1.5rem;
  border-top: 1px solid #e0e0e0;
}

@media (max-width: 768px) {
  .container {
    padding: 15px;
  }

  .section {
    padding: 1.5rem;
  }

  .nav-tabs {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar {
    display: none;
  }
}
</style>
