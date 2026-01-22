<template>
  <div class="stats">
    <PageHeader @change-password="showChangePassword" @logout="handleLogout" />

    <ChangePasswordModal v-if="isChangePasswordOpen" @close="isChangePasswordOpen = false" />

    <div class="container">
      <nav class="nav-tabs">
        <router-link to="/" class="nav-tab" exact-active-class="active">Dashboard</router-link>
        <router-link to="/tickets" class="nav-tab" active-class="active">Tickets</router-link>
        <router-link to="/stats" class="nav-tab" active-class="active">Stats</router-link>
        <router-link to="/settings" class="nav-tab" active-class="active">Settings</router-link>
        <router-link v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin'" to="/users" class="nav-tab" active-class="active">Users</router-link>
        <router-link v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin'" to="/webhooks" class="nav-tab" active-class="active">Webhooks</router-link>
        <router-link v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin'" to="/bulk-email" class="nav-tab" active-class="active">Bulk Email</router-link>
      </nav>

      <div v-if="loading" class="loading">Loading statistics...</div>

      <div v-else-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-else class="stats-content">
        <h2>Ticket Statistics</h2>
        
        <!-- Attendee Tickets Section -->
        <div class="stats-section">
          <h3>Attendee Tickets</h3>
          <div class="stats-table">
            <div class="stats-table-header">
              <div class="stats-col type">Ticket Type</div>
              <div class="stats-col">Sold</div>
              <div class="stats-col">Scanned</div>
              <div class="stats-col">Remaining</div>
              <div class="stats-col progress">Progress</div>
            </div>
            <div v-for="ticket in attendeeStats" :key="ticket.type" class="stats-table-row">
              <div class="stats-col type">{{ ticket.type }}</div>
              <div class="stats-col">{{ ticket.sold }}</div>
              <div class="stats-col scanned-value">{{ ticket.scanned }}</div>
              <div class="stats-col">{{ ticket.remaining }}</div>
              <div class="stats-col progress">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: getPercentage(ticket) + '%' }"></div>
                </div>
                <span class="progress-text">{{ getPercentage(ticket) }}%</span>
              </div>
            </div>
            <div class="stats-table-row total-row">
              <div class="stats-col type"><strong>Total Attendees</strong></div>
              <div class="stats-col"><strong>{{ attendeeTotal.sold }}</strong></div>
              <div class="stats-col scanned-value"><strong>{{ attendeeTotal.scanned }}</strong></div>
              <div class="stats-col"><strong>{{ attendeeTotal.remaining }}</strong></div>
              <div class="stats-col progress">
                <div class="progress-bar">
                  <div class="progress-fill total" :style="{ width: getPercentage(attendeeTotal) + '%' }"></div>
                </div>
                <span class="progress-text"><strong>{{ getPercentage(attendeeTotal) }}%</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Exhibitor Tickets Section -->
        <div class="stats-section">
          <h3>Exhibitor Tickets</h3>
          <div class="stats-table">
            <div class="stats-table-header">
              <div class="stats-col type">Ticket Type</div>
              <div class="stats-col">Sold</div>
              <div class="stats-col">Scanned</div>
              <div class="stats-col">Remaining</div>
              <div class="stats-col progress">Progress</div>
            </div>
            <div class="stats-table-row">
              <div class="stats-col type">{{ exhibitorStats.type }}</div>
              <div class="stats-col">{{ exhibitorStats.sold }}</div>
              <div class="stats-col scanned-value">{{ exhibitorStats.scanned }}</div>
              <div class="stats-col">{{ exhibitorStats.remaining }}</div>
              <div class="stats-col progress">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: getPercentage(exhibitorStats) + '%' }"></div>
                </div>
                <span class="progress-text">{{ getPercentage(exhibitorStats) }}%</span>
              </div>
            </div>
          </div>
          <p class="note">* Exhibitor tickets are grouped by order</p>
        </div>

        <!-- Student Tickets Section -->
        <div class="stats-section">
          <h3>Student Tickets</h3>
          <div class="stats-table">
            <div class="stats-table-header">
              <div class="stats-col type">Ticket Type</div>
              <div class="stats-col">Sold</div>
              <div class="stats-col">Scanned</div>
              <div class="stats-col">Remaining</div>
              <div class="stats-col progress">Progress</div>
            </div>
            <div class="stats-table-row">
              <div class="stats-col type">{{ studentStats.type }}</div>
              <div class="stats-col">{{ studentStats.sold }}</div>
              <div class="stats-col scanned-value">{{ studentStats.scanned }}</div>
              <div class="stats-col">{{ studentStats.remaining }}</div>
              <div class="stats-col progress">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: getPercentage(studentStats) + '%' }"></div>
                </div>
                <span class="progress-text">{{ getPercentage(studentStats) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Grand Total Section -->
        <div class="stats-section grand-total">
          <h3>Grand Total</h3>
          <div class="stats-table">
            <div class="stats-table-header">
              <div class="stats-col type">All Tickets</div>
              <div class="stats-col">Sold</div>
              <div class="stats-col">Scanned</div>
              <div class="stats-col">Remaining</div>
              <div class="stats-col progress">Progress</div>
            </div>
            <div class="stats-table-row total-row">
              <div class="stats-col type"><strong>Grand Total</strong></div>
              <div class="stats-col"><strong>{{ grandTotal.sold }}</strong></div>
              <div class="stats-col scanned-value"><strong>{{ grandTotal.scanned }}</strong></div>
              <div class="stats-col"><strong>{{ grandTotal.remaining }}</strong></div>
              <div class="stats-col progress">
                <div class="progress-bar">
                  <div class="progress-fill grand-total" :style="{ width: getPercentage(grandTotal) + '%' }"></div>
                </div>
                <span class="progress-text"><strong>{{ getPercentage(grandTotal) }}%</strong></span>
              </div>
            </div>
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
  name: 'Stats',
  components: {
    ChangePasswordModal,
    PageHeader,
  },
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const attendeeStats = ref([]);
    const exhibitorStats = ref({ type: 'Exhibitor', sold: 0, scanned: 0, remaining: 0 });
    const studentStats = ref({ type: 'Student', sold: 0, scanned: 0, remaining: 0 });
    const loading = ref(true);
    const error = ref('');
    const isChangePasswordOpen = ref(false);

    const attendeeTotal = computed(() => {
      return {
        sold: attendeeStats.value.reduce((sum, t) => sum + t.sold, 0),
        scanned: attendeeStats.value.reduce((sum, t) => sum + t.scanned, 0),
        remaining: attendeeStats.value.reduce((sum, t) => sum + t.remaining, 0)
      };
    });

    const grandTotal = computed(() => {
      return {
        sold: attendeeTotal.value.sold + exhibitorStats.value.sold + studentStats.value.sold,
        scanned: attendeeTotal.value.scanned + exhibitorStats.value.scanned + studentStats.value.scanned,
        remaining: attendeeTotal.value.remaining + exhibitorStats.value.remaining + studentStats.value.remaining
      };
    });

    const getPercentage = (stats) => {
      if (stats.sold === 0) return 0;
      return Math.round((stats.scanned / stats.sold) * 100);
    };

    const loadStats = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const response = await axios.get('/api/stats');
        attendeeStats.value = response.data.attendeeStats || [];
        exhibitorStats.value = response.data.exhibitorStats || { type: 'Exhibitor', sold: 0, scanned: 0, remaining: 0 };
        studentStats.value = response.data.studentStats || { type: 'Student', sold: 0, scanned: 0, remaining: 0 };
      } catch (err) {
        console.error('Error loading stats:', err);
        error.value = 'Failed to load statistics. Please try again.';
      } finally {
        loading.value = false;
      }
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
      loadStats();
    });

    return {
      authStore,
      attendeeStats,
      exhibitorStats,
      studentStats,
      loading,
      error,
      isChangePasswordOpen,
      attendeeTotal,
      grandTotal,
      getPercentage,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>
</script>

<style scoped>
.stats {
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

.loading {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 18px;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #f5c6cb;
}

.stats-content h2 {
  color: #333;
  margin-bottom: 30px;
  font-size: 28px;
}

.stats-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 30px;
}

.stats-section h3 {
  margin: 0 0 25px 0;
  color: #333;
  font-size: 22px;
  font-weight: 600;
}

.stats-section.grand-total {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.stats-section.grand-total h3 {
  color: white;
}

.stats-table {
  width: 100%;
}

.stats-table-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 2fr;
  gap: 15px;
  padding: 15px 20px;
  background: #f8f9fa;
  border-radius: 8px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-section.grand-total .stats-table-header {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.stats-table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 2fr;
  gap: 15px;
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  transition: background 0.2s;
  align-items: center;
}

.stats-table-row:hover {
  background: #f8f9fa;
}

.stats-section.grand-total .stats-table-row:hover {
  background: rgba(255, 255, 255, 0.1);
}

.stats-table-row:last-child {
  border-bottom: none;
}

.stats-table-row.total-row {
  background: #f8f9fa;
  border-top: 2px solid #667eea;
  margin-top: 10px;
}

.stats-table-row.total-row:hover {
  background: #f0f0f0;
}

.stats-section.grand-total .stats-table-row.total-row {
  background: rgba(255, 255, 255, 0.2);
  border-top: 2px solid white;
}

.stats-section.grand-total .stats-table-row.total-row:hover {
  background: rgba(255, 255, 255, 0.3);
}

.stats-col {
  display: flex;
  align-items: center;
  font-size: 15px;
  color: #333;
}

.stats-section.grand-total .stats-col {
  color: white;
}

.stats-col.type {
  font-weight: 500;
}

.stats-col.scanned-value {
  color: #4CAF50;
  font-weight: 600;
}

.stats-section.grand-total .stats-col.scanned-value {
  color: #a8ff9d;
}

.stats-col.progress {
  display: flex;
  align-items: center;
  gap: 15px;
}

.progress-bar {
  flex: 1;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.stats-section.grand-total .progress-bar {
  background: rgba(255, 255, 255, 0.3);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.progress-fill.total {
  background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
}

.progress-fill.grand-total {
  background: linear-gradient(90deg, #fff 0%, #f0f0f0 100%);
}

.progress-text {
  min-width: 50px;
  text-align: right;
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.stats-section.grand-total .progress-text {
  color: white;
}

.note {
  margin: 15px 0 0 0;
  font-size: 13px;
  color: #999;
  font-style: italic;
}

@media (max-width: 968px) {
  .stats-table-header,
  .stats-table-row {
    grid-template-columns: 2fr 0.8fr 0.8fr 0.8fr 1.5fr;
    gap: 10px;
    padding: 12px 15px;
  }

  .stats-col {
    font-size: 14px;
  }

  .progress-text {
    min-width: 45px;
    font-size: 13px;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 15px;
  }

  .nav-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar {
    display: none;
  }

  .nav-tab {
    padding: 10px 16px;
    font-size: 14px;
    white-space: nowrap;
  }

  .stats-content h2 {
    font-size: 22px;
    margin-bottom: 20px;
  }

  .stats-section {
    padding: 20px;
  }

  .stats-section h3 {
    font-size: 18px;
    margin-bottom: 20px;
  }

  .stats-table-header {
    display: none;
  }

  .stats-table-row {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 10px;
  }

  .stats-col {
    justify-content: space-between;
  }

  .stats-col::before {
    content: attr(data-label);
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.5px;
  }

  .stats-col.type::before {
    content: 'Ticket Type';
  }

  .stats-col.progress {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .progress-bar {
    width: 100%;
  }

  .progress-text {
    text-align: center;
  }

  .note {
    font-size: 12px;
  }
}
</style>
