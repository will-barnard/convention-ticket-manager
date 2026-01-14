<template>
  <div class="settings">
    <PageHeader @change-password="showChangePassword" @logout="handleLogout" />

    <ChangePasswordModal v-if="isChangePasswordOpen" @close="isChangePasswordOpen = false" />

    <div class="container">
      <nav class="nav-tabs">
        <router-link to="/" class="nav-tab" exact-active-class="active">Dashboard</router-link>
        <router-link to="/tickets" class="nav-tab" active-class="active">Tickets</router-link>
        <router-link to="/stats" class="nav-tab" active-class="active">Stats</router-link>
        <router-link to="/settings" class="nav-tab" active-class="active">Settings</router-link>
      </nav>

      <div class="settings-card">
        <h2>General Information</h2>
        
        <form @submit.prevent="saveSettings">
          <div class="form-group">
            <label for="conventionName">Convention Name</label>
            <input
              type="text"
              id="conventionName"
              v-model="settings.convention_name"
              placeholder="Enter convention name"
              required
            />
          </div>

          <div class="form-group">
            <label>Convention Logo</label>
            <div class="logo-upload-area">
              <div v-if="settings.logo_url || logoPreview" class="logo-preview">
                <img :src="logoPreview || getLogoUrl(settings.logo_url)" alt="Convention Logo" />
              </div>
              <div v-else class="logo-placeholder">
                <p>📷 No logo uploaded</p>
              </div>
              
              <div class="logo-buttons">
                <input
                  type="file"
                  ref="logoInput"
                  @change="handleLogoSelect"
                  accept="image/*"
                  style="display: none"
                />
                <button type="button" @click="$refs.logoInput.click()" class="btn-upload">
                  {{ settings.logo_url ? 'Change Logo' : 'Upload Logo' }}
                </button>
                <button 
                  v-if="settings.logo_url || logoPreview" 
                  type="button" 
                  @click="removeLogo" 
                  class="btn-remove-logo"
                >
                  Remove Logo
                </button>
              </div>
              
              <p class="hint">Recommended: PNG or JPG, max 5MB</p>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-save" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>

        <div v-if="message" :class="['message', messageType]">
          {{ message }}
        </div>
      </div>

      <div class="settings-card">
        <h2>Ticket Cap Settings</h2>
        
        <form @submit.prevent="saveSettings">
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="settings.enable_ticket_cap"
              />
              <span>Enable Available Tickets Counter</span>
            </label>
            <p class="hint">Show remaining available tickets on dashboard based on a maximum cap</p>
          </div>

          <div v-if="settings.enable_ticket_cap" class="form-group">
            <label for="ticketCap">Maximum Ticket Cap</label>
            <input
              type="number"
              id="ticketCap"
              v-model.number="settings.ticket_cap"
              placeholder="Enter maximum number of tickets"
              min="0"
            />
            <p class="hint">Set the total number of tickets available for your convention</p>
          </div>
        </form>
      </div>
      
      <div class="settings-card">
        <h2>Email Settings</h2>
        
        <form @submit.prevent="saveSettings">
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="settings.auto_send_emails"
              />
              <span>Automatically Send Ticket Emails</span>
            </label>
            <p class="hint">When enabled, ticket emails will be sent immediately upon creation</p>
          </div>
        </form>

        <div class="batch-send-section">
          <h3>Batch Send Unsent Emails</h3>
          <p class="hint">Send emails to all ticket holders who haven't received their tickets yet. Emails are sent at a rate of 10 per minute to avoid rate limiting.</p>
          
          <button 
            @click="batchSendEmails" 
            class="btn-batch-send"
            :disabled="batchSending"
          >
            {{ batchSending ? `Sending... (${batchProgress.sent}/${batchProgress.total})` : 'Send All Unsent Emails' }}
          </button>
          
          <div v-if="batchMessage" :class="['batch-message', batchMessageType]">
            {{ batchMessage }}
          </div>
        </div>
      </div>
      
      <div class="settings-card">
        <h2>Convention Dates</h2>
        
        <form @submit.prevent="saveSettings">
          <div class="form-group">
            <label for="fridayDate">Friday Date</label>
            <input
              type="date"
              id="fridayDate"
              v-model="settings.friday_date"
            />
            <p class="hint">VIP tickets only - early access day</p>
          </div>

          <div class="form-group">
            <label for="saturdayDate">Saturday Date</label>
            <input
              type="date"
              id="saturdayDate"
              v-model="settings.saturday_date"
            />
            <p class="hint">Main convention day</p>
          </div>

          <div class="form-group">
            <label for="sundayDate">Sunday Date</label>
            <input
              type="date"
              id="sundayDate"
              v-model="settings.sunday_date"
            />
            <p class="hint">Final convention day</p>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-save" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
      
      <div class="settings-card">
        <h2>Export Ticket Data</h2>
        <p class="hint">Download ticket data as CSV files for each ticket type</p>
        
        <div class="export-buttons">
          <button @click="downloadCSV('student')" class="btn-export">
            <font-awesome-icon icon="graduation-cap" />
            Download Student Tickets CSV
          </button>
          <button @click="downloadCSV('exhibitor')" class="btn-export">
            <font-awesome-icon icon="building" />
            Download Exhibitor Tickets CSV
          </button>
          <button @click="downloadCSV('attendee')" class="btn-export">
            <font-awesome-icon icon="calendar-day" />
            Download Attendee Tickets CSV
          </button>
        </div>
      </div>
      
      <div class="settings-card">
        <h2>Post-Convention Report</h2>
        <p class="hint">Download a comprehensive report of all tickets with check-in times</p>
        
        <div class="export-buttons">
          <button @click="downloadPostConventionReport" class="btn-export btn-report">
            <font-awesome-icon icon="file-download" />
            Download Full Convention Report CSV
          </button>
        </div>
      </div>
      
      <div class="settings-card">
        <h2>Future Settings</h2>
        <p class="placeholder-text">Additional settings will be added here in future updates.</p>
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
  name: 'Settings',
  components: {
    ChangePasswordModal,
    PageHeader,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();
    const isChangePasswordOpen = ref(false);

    const settings = ref({
      convention_name: '',
      logo_url: null,
      enable_ticket_cap: false,
      ticket_cap: 0,
      friday_date: null,
      saturday_date: null,
      sunday_date: null,
      auto_send_emails: true
    });
    const logoPreview = ref(null);
    const logoInput = ref(null);
    const logoFile = ref(null);
    const saving = ref(false);
    const message = ref('');
    const messageType = ref('');
    const batchSending = ref(false);
    const batchMessage = ref('');
    const batchMessageType = ref('');
    const batchProgress = ref({ sent: 0, total: 0 });

    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/settings');
        const data = response.data;
        
        // Format dates for HTML5 date inputs (YYYY-MM-DD)
        if (data.friday_date) {
          data.friday_date = new Date(data.friday_date).toISOString().split('T')[0];
        }
        if (data.saturday_date) {
          data.saturday_date = new Date(data.saturday_date).toISOString().split('T')[0];
        }
        if (data.sunday_date) {
          data.sunday_date = new Date(data.sunday_date).toISOString().split('T')[0];
        }
        
        settings.value = data;
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    const handleLogoSelect = (event) => {
      const file = event.target.files[0];
      if (file) {
        logoFile.value = file;
        const reader = new FileReader();
        reader.onload = (e) => {
          logoPreview.value = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    };

    const removeLogo = async () => {
      if (confirm('Are you sure you want to remove the logo?')) {
        try {
          await axios.delete('/api/settings/logo');
          settings.value.logo_url = null;
          logoPreview.value = null;
          logoFile.value = null;
          showMessage('Logo removed successfully', 'success');
        } catch (error) {
          console.error('Error removing logo:', error);
          showMessage('Failed to remove logo', 'error');
        }
      }
    };

    const saveSettings = async () => {
      saving.value = true;
      message.value = '';

      try {
        // Save all settings
        await axios.put('/api/settings', {
          convention_name: settings.value.convention_name,
          enable_ticket_cap: settings.value.enable_ticket_cap,
          ticket_cap: settings.value.ticket_cap,
          friday_date: settings.value.friday_date,
          saturday_date: settings.value.saturday_date,
          sunday_date: settings.value.sunday_date,
          auto_send_emails: settings.value.auto_send_emails
        });

        // Upload logo if selected
        if (logoFile.value) {
          const formData = new FormData();
          formData.append('logo', logoFile.value);
          
          const response = await axios.post('/api/settings/logo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          settings.value.logo_url = response.data.logo_url;
          logoPreview.value = null;
          logoFile.value = null;
        }

        showMessage('Settings saved successfully!', 'success');
      } catch (error) {
        console.error('Error saving settings:', error);
        showMessage('Failed to save settings', 'error');
      } finally {
        saving.value = false;
      }
    };

    const showMessage = (text, type) => {
      message.value = text;
      messageType.value = type;
      setTimeout(() => {
        message.value = '';
      }, 3000);
    };

    const showBatchMessage = (text, type) => {
      batchMessage.value = text;
      batchMessageType.value = type;
      setTimeout(() => {
        batchMessage.value = '';
      }, 5000);
    };

    const batchSendEmails = async () => {
      if (!confirm('Send emails to all ticket holders who haven\'t received their tickets yet? This may take several minutes.')) {
        return;
      }

      batchSending.value = true;
      batchMessage.value = '';
      batchProgress.value = { sent: 0, total: 0 };

      try {
        const response = await axios.post('/api/tickets/batch-send-emails');
        const result = response.data;
        
        batchProgress.value = {
          sent: result.sent,
          total: result.total
        };

        if (result.failed > 0) {
          showBatchMessage(
            `Batch send complete! Sent: ${result.sent}, Failed: ${result.failed}`,
            'warning'
          );
        } else if (result.sent === 0) {
          showBatchMessage('No unsent emails found', 'info');
        } else {
          showBatchMessage(`Successfully sent ${result.sent} emails!`, 'success');
        }
      } catch (error) {
        console.error('Error batch sending emails:', error);
        showBatchMessage('Failed to send emails. Please try again.', 'error');
      } finally {
        batchSending.value = false;
      }
    };

    const downloadCSV = async (ticketType) => {
      try {
        const response = await axios.get('/api/tickets');
        const allTickets = response.data.tickets || response.data;
        const tickets = allTickets.filter(t => t.ticket_type === ticketType);
        
        if (tickets.length === 0) {
          alert(`No ${ticketType} tickets found to export.`);
          return;
        }

        let csvContent = '';
        
        if (ticketType === 'student') {
          // Student CSV: Name, Email, Teacher, Created, Friday Check-in, Saturday Check-in, Sunday Check-in
          csvContent = 'Name,Email,Teacher,Created,Friday Check-in,Saturday Check-in,Sunday Check-in\n';
          tickets.forEach(ticket => {
            const name = `"${ticket.name}"`;
            const email = ticket.email;
            const teacher = `"${ticket.teacher_name || ''}"`;
            const created = new Date(ticket.created_at).toLocaleDateString();
            const friCheckin = ticket.scans?.friday ? 'Yes' : 'No';
            const satCheckin = ticket.scans?.saturday ? 'Yes' : 'No';
            const sunCheckin = ticket.scans?.sunday ? 'Yes' : 'No';
            csvContent += `${name},${email},${teacher},${created},${friCheckin},${satCheckin},${sunCheckin}\n`;
          });
        } else if (ticketType === 'exhibitor') {
          // Exhibitor CSV: Name, Email, Supplies, Created, Friday Check-in, Saturday Check-in, Sunday Check-in
          csvContent = 'Name,Email,Supplies,Created,Friday Check-in,Saturday Check-in,Sunday Check-in\n';
          tickets.forEach(ticket => {
            const name = `"${ticket.name}"`;
            const email = ticket.email;
            const supplies = ticket.supplies 
              ? `"${ticket.supplies.map(s => `${s.name} (${s.quantity})`).join('; ')}"` 
              : '""';
            const created = new Date(ticket.created_at).toLocaleDateString();
            const friCheckin = ticket.scans?.friday ? 'Yes' : 'No';
            const satCheckin = ticket.scans?.saturday ? 'Yes' : 'No';
            const sunCheckin = ticket.scans?.sunday ? 'Yes' : 'No';
            csvContent += `${name},${email},${supplies},${created},${friCheckin},${satCheckin},${sunCheckin}\n`;
          });
        } else if (ticketType === 'attendee') {
          // Attendee CSV: Name, Email, Ticket Type, Created, Friday Check-in, Saturday Check-in, Sunday Check-in
          csvContent = 'Name,Email,Ticket Type,Created,Friday Check-in,Saturday Check-in,Sunday Check-in\n';
          tickets.forEach(ticket => {
            const name = `"${ticket.name}"`;
            const email = ticket.email;
            const subtype = formatAttendeeSubtype(ticket.ticket_subtype);
            const created = new Date(ticket.created_at).toLocaleDateString();
            const friCheckin = ticket.scans?.friday ? 'Yes' : 'No';
            const satCheckin = ticket.scans?.saturday ? 'Yes' : 'No';
            const sunCheckin = ticket.scans?.sunday ? 'Yes' : 'No';
            csvContent += `${name},${email},"${subtype}",${created},${friCheckin},${satCheckin},${sunCheckin}\n`;
          });
        }

        // Create and download the file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `${ticketType}-tickets-${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('Error downloading CSV:', error);
        alert('Failed to download CSV. Please try again.');
      }
    };

    const formatAttendeeSubtype = (subtype) => {
      const subtypeMap = {
        'vip': 'VIP (3-Day)',
        'adult_2day': 'Adult 2-Day',
        'adult_saturday': 'Adult Saturday',
        'adult_sunday': 'Adult Sunday',
        'child_2day': 'Child 2-Day',
        'child_saturday': 'Child Saturday',
        'child_sunday': 'Child Sunday'
      };
      return subtypeMap[subtype] || subtype;
    };

    const downloadPostConventionReport = async () => {
      try {
        const response = await axios.get('/api/tickets');
        const allTickets = response.data.tickets || response.data;
        
        if (allTickets.length === 0) {
          alert('No tickets found to export.');
          return;
        }

        // Post-Convention Report: All tickets with check-in times
        let csvContent = 'Name,Email,Ticket Type,Created,Friday Check-in,Saturday Check-in,Sunday Check-in\n';
        
        allTickets.forEach(ticket => {
          const name = `"${ticket.name}"`;
          const email = ticket.email;
          
          // Format ticket type
          let ticketTypeStr = '';
          if (ticket.ticket_type === 'student') {
            ticketTypeStr = 'Student';
          } else if (ticket.ticket_type === 'exhibitor') {
            ticketTypeStr = 'Exhibitor';
          } else if (ticket.ticket_type === 'attendee') {
            ticketTypeStr = formatAttendeeSubtype(ticket.ticket_subtype);
          }
          
          const created = new Date(ticket.created_at).toLocaleDateString();
          
          // Format check-in times or "Didn't Attend"
          const friCheckin = ticket.scans?.fridayTime 
            ? new Date(ticket.scans.fridayTime).toLocaleString()
            : (ticket.ticket_type === 'attendee' && !canAttendDay(ticket.ticket_subtype, 'friday') ? 'N/A' : 'Didn\'t Attend');
          
          const satCheckin = ticket.scans?.saturdayTime 
            ? new Date(ticket.scans.saturdayTime).toLocaleString()
            : (ticket.ticket_type === 'attendee' && !canAttendDay(ticket.ticket_subtype, 'saturday') ? 'N/A' : 'Didn\'t Attend');
          
          const sunCheckin = ticket.scans?.sundayTime 
            ? new Date(ticket.scans.sundayTime).toLocaleString()
            : (ticket.ticket_type === 'attendee' && !canAttendDay(ticket.ticket_subtype, 'sunday') ? 'N/A' : 'Didn\'t Attend');
          
          csvContent += `${name},${email},"${ticketTypeStr}",${created},"${friCheckin}","${satCheckin}","${sunCheckin}"\n`;
        });

        // Create and download the file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `post-convention-report-${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error('Error downloading report:', error);
        alert('Failed to download report. Please try again.');
      }
    };

    const canAttendDay = (subtype, day) => {
      const dayMapping = {
        'vip': ['friday', 'saturday', 'sunday'],
        'adult_2day': ['saturday', 'sunday'],
        'adult_saturday': ['saturday'],
        'adult_sunday': ['sunday'],
        'child_2day': ['saturday', 'sunday'],
        'child_saturday': ['saturday'],
        'child_sunday': ['sunday']
      };
      return dayMapping[subtype]?.includes(day) || false;
    };

    const getLogoUrl = (logoUrl) => {
      if (!logoUrl) return '';
      // Logo is served through nginx proxy at /uploads
      return logoUrl;
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
      fetchSettings();
    });

    return {
      authStore,
      settings,
      logoPreview,
      logoInput,
      saving,
      message,
      messageType,
      batchSending,
      batchMessage,
      batchMessageType,
      batchProgress,
      isChangePasswordOpen,
      handleLogoSelect,
      removeLogo,
      saveSettings,
      getLogoUrl,
      batchSendEmails,
      downloadCSV,
      downloadPostConventionReport,
      showChangePassword,
      handleLogout
    };
  }
};
</script>

<style scoped>
.settings {
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
  margin-bottom: -2px;
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

.settings-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.settings-card h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #333;
  font-size: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #555;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group input[type="number"] {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus {
  outline: none;
  border-color: #667eea;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 600;
  color: #555;
}

.checkbox-label input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.logo-upload-area {
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
}

.logo-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 1.5rem;
}

.logo-preview img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  object-fit: contain;
}

.logo-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.btn-remove-logo {
  background: #ff4444;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.3s;
}

.btn-remove-logo:hover {
  background: #cc0000;
}

.logo-placeholder {
  padding: 2rem;
  color: #999;
  font-size: 1.2rem;
}

.btn-upload {
  background: #667eea;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.3s;
}

.btn-upload:hover {
  background: #5568d3;
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #999;
}

.form-actions {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #e0e0e0;
}

.btn-save {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: transform 0.2s;
}

.btn-save:hover:not(:disabled) {
  transform: translateY(-2px);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.message {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 500;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.batch-send-section {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid #e0e0e0;
}

.batch-send-section h3 {
  margin-bottom: 10px;
  color: #333;
  font-size: 18px;
}

.btn-batch-send {
  background: #667eea;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 15px;
}

.btn-batch-send:hover:not(:disabled) {
  background: #5568d3;
}

.btn-batch-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.batch-message {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 500;
}

.batch-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.batch-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.batch-message.warning {
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
}

.batch-message.info {
  background: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.placeholder-text {
  color: #999;
  font-style: italic;
}

.export-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 20px;
}

.btn-export {
  padding: 15px 25px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-export:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-export:active {
  transform: translateY(0);
}

.btn-report {
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.btn-report:hover {
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
}

@media (min-width: 768px) {
  .export-buttons {
    flex-direction: row;
  }
  
  .btn-export {
    flex: 1;
  }
}
</style>
