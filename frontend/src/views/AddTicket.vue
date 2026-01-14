<template>
  <div class="add-ticket">
    <header class="header">
      <h1>Add New Ticket</h1>
      <button @click="goBack" class="btn-secondary">Back to Tickets</button>
    </header>

    <div class="container">
      <div class="ticket-type-tabs">
        <button
          type="button"
          @click="formData.ticketType = 'student'; onTicketTypeChange()"
          :class="['tab-btn', { active: formData.ticketType === 'student' }]"
        >
          🎓 Student Ticket
        </button>
        <button
          type="button"
          @click="formData.ticketType = 'exhibitor'; onTicketTypeChange()"
          :class="['tab-btn', { active: formData.ticketType === 'exhibitor' }]"
        >
          🏢 Exhibitor Ticket
        </button>
        <button
          type="button"
          @click="formData.ticketType = 'day_pass'; onTicketTypeChange()"
          :class="['tab-btn', { active: formData.ticketType === 'day_pass' }]"
        >
          📅 Day Pass
        </button>
      </div>

      <div class="form-card">
        <h2>{{ ticketTypeTitle }}</h2>
        <form @submit.prevent="handleSubmit">

          <div class="form-group">
            <label for="name">Name *</label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              required
              :placeholder="namePlaceholder"
            />
          </div>

          <div v-if="formData.ticketType === 'student'" class="form-group">
            <label for="teacherName">Teacher Name *</label>
            <input
              id="teacherName"
              v-model="formData.teacherName"
              type="text"
              :required="formData.ticketType === 'student'"
              placeholder="Enter teacher name"
            />
          </div>

          <div class="form-group">
            <label for="email">Email Address *</label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              required
              placeholder="Enter email address"
            />
          </div>

          <!-- Exhibitor Supplies Section -->
          <div v-if="formData.ticketType === 'exhibitor'" class="supplies-section">
            <h3>Supplies Provided</h3>
            <div v-for="(supply, index) in formData.supplies" :key="index" class="supply-item">
              <div class="supply-fields">
                <input
                  v-model="supply.name"
                  type="text"
                  placeholder="Supply name"
                  required
                />
                <input
                  v-model.number="supply.quantity"
                  type="number"
                  min="1"
                  placeholder="Qty"
                  required
                />
                <button
                  type="button"
                  @click="removeSupply(index)"
                  class="btn-remove"
                  :disabled="formData.supplies.length === 1"
                >
                  ✕
                </button>
              </div>
            </div>
            <button
              type="button"
              @click="addSupply"
              class="btn-add-supply"
            >
              + Add Supply
            </button>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <div v-if="success" class="success-message">
            {{ success }}
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn-primary"
              :disabled="loading"
            >
              {{ loading ? 'Creating Ticket...' : 'Create & Send Ticket' }}
            </button>
            <button
              type="button"
              @click="resetForm"
              class="btn-secondary"
              :disabled="loading"
            >
              Clear Form
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

export default {
  name: 'AddTicket',
  setup() {
    const router = useRouter();

    const formData = reactive({
      ticketType: 'student',
      name: '',
      teacherName: '',
      email: '',
      supplies: [{ name: '', quantity: 1 }],
    });

    const loading = ref(false);
    const error = ref('');
    const success = ref('');

    const ticketTypeTitle = computed(() => {
      const titles = {
        student: 'Student Ticket',
        exhibitor: 'Exhibitor Ticket',
        day_pass: 'Day Pass'
      };
      return titles[formData.ticketType] || '';
    });

    const namePlaceholder = computed(() => {
      switch (formData.ticketType) {
        case 'student':
          return 'Enter student name';
        case 'exhibitor':
          return 'Enter exhibitor/company name';
        case 'day_pass':
          return 'Enter attendee name';
        default:
          return 'Enter name';
      }
    });

    const onTicketTypeChange = () => {
      // Reset conditional fields
      if (formData.ticketType !== 'student') {
        formData.teacherName = '';
      }
      if (formData.ticketType !== 'exhibitor') {
        formData.supplies = [{ name: '', quantity: 1 }];
      }
    };

    const addSupply = () => {
      formData.supplies.push({ name: '', quantity: 1 });
    };

    const removeSupply = (index) => {
      if (formData.supplies.length > 1) {
        formData.supplies.splice(index, 1);
      }
    };

    const handleSubmit = async () => {
      loading.value = true;
      error.value = '';
      success.value = '';

      try {
        const payload = {
          ticketType: formData.ticketType,
          name: formData.name,
          email: formData.email,
        };

        if (formData.ticketType === 'student') {
          payload.teacherName = formData.teacherName;
        }

        if (formData.ticketType === 'exhibitor') {
          // Filter out empty supplies
          payload.supplies = formData.supplies.filter(s => s.name.trim() !== '');
        }

        const response = await axios.post('/api/tickets', payload);
        
        if (response.data.warning) {
          success.value = 'Ticket created successfully, but email delivery failed. Please check email configuration.';
        } else {
          success.value = 'Ticket created and sent successfully!';
        }

        // Reset form after success
        setTimeout(() => {
          resetForm();
          router.push('/');
        }, 2000);
      } catch (err) {
        error.value = err.response?.data?.error || 'Failed to create ticket';
        console.error('Error creating ticket:', err);
      } finally {
        loading.value = false;
      }
    };

    const resetForm = () => {
      formData.ticketType = 'student';
      formData.name = '';
      formData.teacherName = '';
      formData.email = '';
      formData.supplies = [{ name: '', quantity: 1 }];
      error.value = '';
      success.value = '';
    };

    const goBack = () => {
      router.push('/tickets');
    };

    return {
      formData,
      loading,
      error,
      success,
      ticketTypeTitle,
      namePlaceholder,
      handleSubmit,
      onTicketTypeChange,
      addSupply,
      removeSupply,
      resetForm,
      goBack,
    };
  },
};
</script>

<style scoped>
.add-ticket {
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

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

.ticket-type-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  background: white;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.tab-btn {
  flex: 1;
  padding: 15px 20px;
  border: 2px solid #e0e0e0;
  background: white;
  color: #666;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tab-btn:hover {
  border-color: #667eea;
  color: #667eea;
  background: #f8f9ff;
}

.tab-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.form-card {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-card h2 {
  margin: 0 0 30px 0;
  color: #333;
  font-size: 24px;
  padding-bottom: 15px;
  border-bottom: 2px solid #f0f0f0;
}

select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
  box-sizing: border-box;
  background-color: white;
}

select:focus {
  outline: none;
  border-color: #667eea;
}

.supplies-section {
  margin: 30px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 5px;
}

.supplies-section h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #333;
  font-size: 18px;
}

.supply-item {
  margin-bottom: 10px;
}

.supply-fields {
  display: flex;
  gap: 10px;
}

.supply-fields input[type="text"] {
  flex: 2;
}

.supply-fields input[type="number"] {
  flex: 0 0 80px;
}

.btn-remove {
  background: #dc3545;
  color: white;
  border: none;
  padding: 12px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  flex: 0 0 auto;
}

.btn-remove:hover:not(:disabled) {
  background: #c82333;
}

.btn-remove:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-add-supply {
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 10px;
}

.btn-add-supply:hover {
  background: #218838;
}

.form-group {
  margin-bottom: 25px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #667eea;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px;
  border-radius: 5px;
  margin-bottom: 20px;
}

.success-message {
  background: #d4edda;
  color: #155724;
  padding: 12px;
  border-radius: 5px;
  margin-bottom: 20px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 30px;
}

.form-actions button {
  flex: 1;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
