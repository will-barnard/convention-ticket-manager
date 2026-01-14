<template>
  <div class="dashboard">
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
      <div class="actions-bar">
        <button @click="goToAddTicket" class="btn-primary">
          + Add New Ticket
        </button>
        <button @click="loadTickets" class="btn-secondary">
          Refresh
        </button>
      </div>

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

      <div v-else class="tickets-grid">
        <div class="tickets-stats">
          <div class="stat-card">
            <div class="stat-value">{{ tickets.length }}</div>
            <div class="stat-label">Total Tickets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ studentTickets }}</div>
            <div class="stat-label">Student Tickets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ exhibitorTickets }}</div>
            <div class="stat-label">Exhibitor Tickets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ dayPassTickets }}</div>
            <div class="stat-label">Day Passes</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ usedTickets }}</div>
            <div class="stat-label">Used Tickets</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ unusedTickets }}</div>
            <div class="stat-label">Available</div>
          </div>
        </div>

        <div class="filter-bar">
          <button
            @click="filterType = 'all'"
            :class="['filter-btn', { active: filterType === 'all' }]"
          >
            All ({{ tickets.length }})
          </button>
          <button
            @click="filterType = 'student'"
            :class="['filter-btn', { active: filterType === 'student' }]"
          >
            Students ({{ studentTickets }})
          </button>
          <button
            @click="filterType = 'exhibitor'"
            :class="['filter-btn', { active: filterType === 'exhibitor' }]"
          >
            Exhibitors ({{ exhibitorTickets }})
          </button>
          <button
            @click="filterType = 'day_pass'"
            :class="['filter-btn', { active: filterType === 'day_pass' }]"
          >
            Day Passes ({{ dayPassTickets }})
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
                  <span :class="['type-badge', ticket.ticket_type]">
                    {{ formatTicketType(ticket.ticket_type) }}
                  </span>
                </td>
                <td>
                  <strong>{{ ticket.name }}</strong>
                  <div v-if="ticket.ticket_type === 'exhibitor' && ticket.supplies" class="supplies-preview">
                    <small>{{ ticket.supplies.length }} supplies</small>
                  </div>
                </td>
                <td>
                  <span v-if="ticket.ticket_type === 'student'">{{ ticket.teacher_name || '-' }}</span>
                  <span v-else-if="ticket.ticket_type === 'exhibitor' && ticket.supplies">
                    <details>
                      <summary style="cursor: pointer;">View Supplies</summary>
                      <ul style="margin: 5px 0; padding-left: 20px;">
                        <li v-for="(supply, idx) in ticket.supplies" :key="idx">
                          {{ supply.name }} ({{ supply.quantity }})
                        </li>
                      </ul>
                    </details>
                  </span>
                  <span v-else>-</span>
                </td>
                <td>{{ ticket.email }}</td>
                <td>
                  <span :class="['status', ticket.is_used ? 'used' : 'available']">
                    {{ ticket.is_used ? 'Used' : 'Available' }}
                  </span>
                </td>
                <td>{{ formatDate(ticket.created_at) }}</td>
                <td>
                  <button
                    @click="deleteTicket(ticket.id)"
                    class="btn-delete"
                    title="Delete ticket"
                  >
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
  name: 'Dashboard',
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
    const filterType = ref('all');

    const studentTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'student').length
    );

    const exhibitorTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'exhibitor').length
    );

    const dayPassTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'day_pass').length
    );

    const usedTickets = computed(() => 
      tickets.value.filter(t => t.is_used).length
    );

    const unusedTickets = computed(() => 
      tickets.value.filter(t => !t.is_used).length
    );

    const filteredTickets = computed(() => {
      if (filterType.value === 'all') {
        return tickets.value;
      }
      return tickets.value.filter(t => t.ticket_type === filterType.value);
    });

    const loadTickets = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const response = await axios.get('/api/tickets');
        tickets.value = response.data;
      } catch (err) {
        error.value = 'Failed to load tickets';
        console.error('Error loading tickets:', err);
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
        await loadTickets();
      } catch (err) {
        alert('Failed to delete ticket');
        console.error('Error deleting ticket:', err);
      }
    };

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    const formatTicketType = (type) => {
      const types = {
        student: 'Student',
        exhibitor: 'Exhibitor',
        day_pass: 'Day Pass'
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
      dayPassTickets,
      usedTickets,
      unusedTickets,
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
.dashboard {
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
  font-size: 24px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.actions-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
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

.tickets-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-btn {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #f0f0ff;
}

.filter-btn.active {
  background: #667eea;
  color: white;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 30px;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stat-value {
  font-size: 36px;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 10px;
}

.stat-label {
  color: #666;
  font-size: 14px;
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

thead {
  background: #f8f9fa;
}

th {
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e9ecef;
}

td {
  padding: 15px;
  border-bottom: 1px solid #e9ecef;
}

tbody tr:hover {
  background: #f8f9fa;
}

.status {
  padding: 5px 12px;

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.type-badge.student {
  background: #e3f2fd;
  color: #1565c0;
}

.type-badge.exhibitor {
  background: #f3e5f5;
  color: #6a1b9a;
}

.type-badge.day_pass {
  background: #fff3e0;
  color: #e65100;
}

.supplies-preview {
  color: #666;
  font-size: 12px;
  margin-top: 2px;
}

details summary {
  color: #667eea;
  font-size: 13px;
}

details ul {
  font-size: 12px;
  color: #666;
}
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.status.available {
  background: #d4edda;
  color: #155724;
}

.status.used {
  background: #f8d7da;
  color: #721c24;
}

.btn-delete {
  background: #dc3545;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-delete:hover {
  background: #c82333;
}
</style>
