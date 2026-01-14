<template>
  <div class="home">
    <PageHeader @change-password="showChangePassword" @logout="handleLogout" />

    <ChangePasswordModal v-if="isChangePasswordOpen" @close="isChangePasswordOpen = false" />

    <div class="container">
      <nav class="nav-tabs">
        <router-link to="/" class="nav-tab" exact-active-class="active">Dashboard</router-link>
        <router-link to="/tickets" class="nav-tab" active-class="active">Tickets</router-link>
        <router-link to="/stats" class="nav-tab" active-class="active">Stats</router-link>
        <router-link to="/settings" class="nav-tab" active-class="active">Settings</router-link>
      </nav>

      <div v-if="!loading && !datesConfigured" class="warning-banner">
        <div class="warning-content">
          <span class="warning-icon">⚠️</span>
          <div class="warning-text">
            <strong>Convention dates not configured!</strong>
            <p>Please set your convention dates in Settings to enable ticket verification and usage tracking.</p>
          </div>
          <router-link to="/settings" class="btn-configure">Configure Dates</router-link>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading stats...</div>

      <div v-else-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-else class="stats-dashboard">
        <h2>Statistics Overview</h2>
        
        <div class="stats-grid">
          <div class="stat-card total">
            <div class="stat-icon">
              <font-awesome-icon icon="ticket" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ tickets.length }}</div>
              <div class="stat-label">Total Tickets</div>
            </div>
          </div>

          <div class="stat-card attendee">
            <div class="stat-icon">
              <font-awesome-icon icon="calendar-day" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ attendeeTickets }}</div>
              <div class="stat-label">Attendee Tickets</div>
            </div>
          </div>

          <div class="stat-card exhibitor">
            <div class="stat-icon">
              <font-awesome-icon icon="building" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ exhibitorTickets }}</div>
              <div class="stat-label">Exhibitor Tickets</div>
            </div>
          </div>
          
          <div class="stat-card student">
            <div class="stat-icon">
              <font-awesome-icon icon="graduation-cap" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ studentTickets }}</div>
              <div class="stat-label">Student Tickets</div>
            </div>
          </div>
          
          <div class="stat-card used">
            <div class="stat-icon">
              <font-awesome-icon icon="check" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ usedTickets }}</div>
              <div class="stat-label">Used Tickets</div>
            </div>
          </div>
          
          <div v-if="settings.enable_ticket_cap" class="stat-card available">
            <div class="stat-icon">
              <font-awesome-icon icon="star" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ availableTickets }}</div>
              <div class="stat-label">Available</div>
            </div>
          </div>
        </div>

        <div class="quick-actions">
          <h3>Quick Actions</h3>
          <div class="action-buttons">
            <button @click="goToAddTicket" class="action-btn">
              <span class="icon">➕</span>
              <span>Add New Ticket</span>
            </button>
            <button @click="goToTickets" class="action-btn">
              <span class="icon">📋</span>
              <span>View All Tickets</span>
            </button>
          </div>
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
  name: 'Home',
  components: {
    ChangePasswordModal,
    PageHeader,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const tickets = ref([]);
    const loading = ref(true);
    const error = ref('');
    const isChangePasswordOpen = ref(false);
    const settings = ref({
      enable_ticket_cap: false,
      ticket_cap: 0,
      friday_date: null,
      saturday_date: null,
      sunday_date: null
    });

    const studentTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'student').length
    );

    const exhibitorTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'exhibitor').length
    );

    const attendeeTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'attendee').length
    );

    const usedTickets = computed(() => 
      tickets.value.filter(t => t.is_used).length
    );

    const unusedTickets = computed(() => 
      tickets.value.filter(t => !t.is_used).length
    );

    const availableTickets = computed(() => {
      if (settings.value.enable_ticket_cap && settings.value.ticket_cap > 0) {
        return settings.value.ticket_cap - tickets.value.length;
      }
      return 0;
    });

    const datesConfigured = computed(() => {
      return settings.value.friday_date || settings.value.saturday_date || settings.value.sunday_date;
    });

    const loadTickets = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const response = await axios.get('/api/tickets');
        tickets.value = response.data;
      } catch (err) {
        console.error('Error loading tickets:', err);
        error.value = 'Failed to load tickets. Please try again.';
      } finally {
        loading.value = false;
      }
    };

    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/settings');
        settings.value = response.data;
      } catch (error) {
        console.log('Could not fetch settings');
      }
    };

    const goToAddTicket = () => {
      router.push('/add-ticket');
    };

    const goToTickets = () => {
      router.push('/tickets');
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
      loadTickets();
      fetchSettings();
    });

    return {
      authStore,
      tickets,
      loading,
      error,
      isChangePasswordOpen,
      studentTickets,
      exhibitorTickets,
      attendeeTickets,
      usedTickets,
      unusedTickets,
      availableTickets,
      datesConfigured,
      settings,
      goToAddTicket,
      goToTickets,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.home {
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

.stats-dashboard h2 {
  color: #333;
  margin-bottom: 30px;
  font-size: 28px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 20px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.stat-icon {
  font-size: 48px;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 36px;
  font-weight: bold;
  color: #333;
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-top: 5px;
}

.stat-card.total {
  border-left: 4px solid #667eea;
}

.stat-card.student {
  border-left: 4px solid #4CAF50;
}

.stat-card.exhibitor {
  border-left: 4px solid #FF9800;
}

.stat-card.attendee {
  border-left: 4px solid #2196F3;
}

.stat-card.used {
  border-left: 4px solid #9E9E9E;
}

.stat-card.available {
  border-left: 4px solid #FFC107;
}

.quick-actions {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.quick-actions h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 20px;
}

.action-buttons {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 30px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #5568d3;
}

.action-btn .icon {
  font-size: 20px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 18px;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 15px;
  border-radius: 5px;
  text-align: center;
}

.warning-banner {
  background: linear-gradient(135deg, #FFA726 0%, #FB8C00 100%);
  color: white;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 30px;
  box-shadow: 0 4px 12px rgba(251, 140, 0, 0.3);
}

.warning-content {
  display: flex;
  align-items: center;
  gap: 20px;
}

.warning-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.warning-text {
  flex: 1;
}

.warning-text strong {
  display: block;
  font-size: 18px;
  margin-bottom: 5px;
}

.warning-text p {
  margin: 0;
  font-size: 14px;
  opacity: 0.95;
}

.btn-configure {
  background: white;
  color: #FB8C00;
  padding: 10px 20px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s;
  display: inline-block;
}

.btn-configure:hover {
  background: #f5f5f5;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: white;
  color: #667eea;
  border: 1px solid #667eea;
}

.btn-secondary:hover {
  background: #f0f0ff;
}
</style>
