<template>
  <div class="tickets">
    <header class="header">
      <h1>Convention Ticket Manager</h1>
      <div class="header-actions">
        <span>Welcome, {{ authStore.user?.username }}</span>
        <button @click="showChangePassword" class="btn-secondary">Change Password</button>
        <button @click="handleLogout" class="btn-secondary">Logout</button>
      </div>
    </header>

    <ChangePasswordModal v-if="isChangePasswordOpen" @close="isChangePasswordOpen = false" />

    <div class="container">
      <nav class="nav-tabs">
        <router-link to="/" class="nav-tab" exact-active-class="active">Dashboard</router-link>
        <router-link to="/tickets" class="nav-tab" active-class="active">Tickets</router-link>
        <router-link to="/usage" class="nav-tab" active-class="active">Usage</router-link>
        <router-link to="/settings" class="nav-tab" active-class="active">Settings</router-link>
      </nav>

      <div v-if="loading" class="loading">Loading tickets...</div>

      <div v-else-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-else-if="tickets.length === 0" class="empty-state">
        <p>No tickets issued yet.</p>
        <button @click="goToAddTicket" class="btn-primary">
          Issue Your First Ticket
        </button>
      </div>

      <div v-else class="tickets-content">
        <div class="ticket-type-tabs">
          <button
            @click="filterType = 'student'"
            :class="['type-tab', { active: filterType === 'student' }]"
          >
            <font-awesome-icon icon="graduation-cap" />
            Students ({{ studentTickets }})
          </button>
          <button
            @click="filterType = 'exhibitor'"
            :class="['type-tab', { active: filterType === 'exhibitor' }]"
          >
            <font-awesome-icon icon="building" />
            Exhibitors ({{ exhibitorTickets }})
          </button>
          <button
            @click="filterType = 'attendee'"
            :class="['type-tab', { active: filterType === 'attendee' }]"
          >
            <font-awesome-icon icon="calendar-day" />
            Attendees ({{ attendeeTickets }})
          </button>
        </div>

        <div class="actions-bar">
          <button @click="goToAddTicket" class="btn-primary">
            + Add New Ticket
          </button>
          <button @click="loadTickets" class="btn-secondary">
            Refresh
          </button>
        </div>

        <div class="tickets-table">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Teacher/Info</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ticket in filteredTickets" :key="ticket.id">
                <td>
                  <span :class="['badge', ticket.ticket_type]">
                    {{ formatTicketType(ticket.ticket_type) }}
                  </span>
                </td>
                <td>{{ ticket.name }}</td>
                <td>{{ ticket.teacher_name || '-' }}</td>
                <td>{{ ticket.email }}</td>
                <td>
                  <span :class="['status', { used: ticket.is_used }]">
                    {{ ticket.is_used ? 'Used' : 'Available' }}
                  </span>
                </td>
                <td>{{ formatDate(ticket.created_at) }}</td>
                <td>
                  <button @click="deleteTicket(ticket.id)" class="btn-delete">
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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

export default {
  name: 'Tickets',
  components: {
    ChangePasswordModal,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const tickets = ref([]);
    const loading = ref(true);
    const error = ref('');
    const isChangePasswordOpen = ref(false);
    const filterType = ref('student');

    const studentTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'student').length
    );

    const exhibitorTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'exhibitor').length
    );

    const attendeeTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'attendee').length
    );

    const filteredTickets = computed(() => {
      return tickets.value.filter(t => t.ticket_type === filterType.value);
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

    const deleteTicket = async (id) => {
      if (!confirm('Are you sure you want to delete this ticket?')) {
        return;
      }

      try {
        await axios.delete(`/api/tickets/${id}`);
        tickets.value = tickets.value.filter(t => t.id !== id);
      } catch (err) {
        console.error('Error deleting ticket:', err);
        alert('Failed to delete ticket. Please try again.');
      }
    };

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString();
    };

    const formatTicketType = (type) => {
      const types = {
        student: 'Student',
        exhibitor: 'Exhibitor',
        attendee: 'Attendee'
      };
      return types[type] || type;
    };

    const goToAddTicket = () => {
      router.push('/add-ticket');
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
    });

    return {
      authStore,
      tickets,
      loading,
      error,
      isChangePasswordOpen,
      filterType,
      studentTickets,
      exhibitorTickets,
      attendeeTickets,
      filteredTickets,
      loadTickets,
      deleteTicket,
      formatDate,
      formatTicketType,
      goToAddTicket,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.tickets {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: white;
  padding: 20px 40px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 15px;
  align-items: center;
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

.actions-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.ticket-type-tabs {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  border-bottom: 3px solid #e0e0e0;
  padding-bottom: 0;
}

.type-tab {
  background: transparent;
  color: #666;
  border: none;
  border-bottom: 4px solid transparent;
  padding: 15px 25px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: -3px;
}

.type-tab:hover {
  color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.type-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.type-tab svg {
  font-size: 18px;
}

.tickets-table {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  background: #f8f9fa;
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
}

td {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
}

tr:hover td {
  background: #f8f9fa;
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.badge.student {
  background: #e8f5e9;
  color: #2e7d32;
}

.badge.exhibitor {
  background: #fff3e0;
  color: #e65100;
}

.badge.attendee {
  background: #e3f2fd;
  color: #1565c0;
}

.status {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: #c8e6c9;
  color: #2e7d32;
}

.status.used {
  background: #f5f5f5;
  color: #757575;
}

.btn-delete {
  background: #f44336;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn-delete:hover {
  background: #d32f2f;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 15px;
  border-radius: 5px;
  text-align: center;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 10px;
}

.empty-state p {
  color: #666;
  font-size: 18px;
  margin-bottom: 20px;
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
