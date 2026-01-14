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
      </nav>

      <div v-if="loading" class="loading">Loading usage statistics...</div>

      <div v-else-if="error" class="error-message">
        {{ error }}
      </div>

      <div v-else-if="!stats || stats.length === 0" class="empty-state">
        <p>No convention dates configured yet.</p>
        <p>Please set up your convention dates in Settings.</p>
        <router-link to="/settings" class="btn-primary">Go to Settings</router-link>
      </div>

      <div v-else class="stats-content">
        <h2>Ticket Statistics by Day</h2>
        
        <div class="stats-grid">
          <div v-for="day in stats" :key="day.day" class="day-card">
            <div class="day-header">
              <h3>{{ day.day }}</h3>
              <p class="date">{{ formatDate(day.date) }}</p>
            </div>
            
            <div class="stats-content">
              <div class="stat-row">
                <span class="label">Tickets Sold:</span>
                <span class="value sold">{{ day.sold }}</span>
              </div>
              <div class="stat-row">
                <span class="label">Tickets Scanned:</span>
                <span class="value scanned">{{ day.scanned }}</span>
              </div>
              <div class="stat-row">
                <span class="label">Remaining:</span>
                <span class="value remaining">{{ day.sold - day.scanned }}</span>
              </div>
            </div>

            <div class="progress-section">
              <div class="progress-bar">
                <div 
                  class="progress-fill" 
                  :style="{ width: day.percentage + '%' }"
                ></div>
              </div>
              <p class="percentage">{{ day.percentage }}% scanned</p>
            </div>
          </div>
        </div>

        <div class="summary-card">
          <h3>Overall Summary</h3>
          <div class="summary-stats">
            <div class="summary-item">
              <div class="summary-value">{{ totalSold }}</div>
              <div class="summary-label">Total Tickets Sold</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">{{ totalScanned }}</div>
              <div class="summary-label">Total Tickets Scanned</div>
            </div>
            <div class="summary-item">
              <div class="summary-value">{{ overallPercentage }}%</div>
              <div class="summary-label">Overall Usage Rate</div>
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

    const stats = ref([]);
    const loading = ref(true);
    const error = ref('');
    const isChangePasswordOpen = ref(false);

    const totalSold = computed(() => {
      return stats.value.reduce((sum, day) => sum + day.sold, 0);
    });

    const totalScanned = computed(() => {
      return stats.value.reduce((sum, day) => sum + day.scanned, 0);
    });

    const overallPercentage = computed(() => {
      if (totalSold.value === 0) return 0;
      return Math.round((totalScanned.value / totalSold.value) * 100);
    });

    const loadStats = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const response = await axios.get('/api/stats');
        stats.value = response.data.stats || [];
      } catch (err) {
        console.error('Error loading usage stats:', err);
        error.value = 'Failed to load usage statistics. Please try again.';
      } finally {
        loading.value = false;
      }
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
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
      stats,
      loading,
      error,
      isChangePasswordOpen,
      totalSold,
      totalScanned,
      overallPercentage,
      formatDate,
      showChangePassword,
      handleLogout,
    };
  },
};
</script>

<style scoped>
.stats {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: white;
  padding: 20px 30px;
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

.btn-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #667eea;
  color: white;
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

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.empty-state p {
  color: #666;
  font-size: 18px;
  margin-bottom: 20px;
}

.btn-primary {
  background: #667eea;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  display: inline-block;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #5568d3;
}

.stats-content h2 {
  color: #333;
  margin-bottom: 30px;
  font-size: 28px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.day-card {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.day-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.day-header {
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 15px;
  margin-bottom: 20px;
}

.day-header h3 {
  margin: 0 0 5px 0;
  color: #667eea;
  font-size: 24px;
}

.day-header .date {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.stats-content {
  margin-bottom: 20px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-row .label {
  color: #666;
  font-size: 14px;
}

.stat-row .value {
  font-weight: bold;
  font-size: 18px;
}

.value.sold {
  color: #667eea;
}

.value.scanned {
  color: #4CAF50;
}

.value.remaining {
  color: #FF9800;
}

.progress-section {
  margin-top: 20px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.percentage {
  text-align: center;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.summary-card {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.summary-card h3 {
  margin: 0 0 25px 0;
  color: #333;
  font-size: 24px;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 30px;
}

.summary-item {
  text-align: center;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.summary-value {
  font-size: 36px;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 10px;
}

.summary-label {
  color: #666;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
