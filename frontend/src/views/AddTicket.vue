<template>
  <div class="add-ticket">
    <header class="header">
      <h1>Create Ticket Order</h1>
      <button @click="goBack" class="btn-secondary">Back to Tickets</button>
    </header>

    <div class="container">
      <div class="form-card">
        <h2>Order Information</h2>
        <form @submit.prevent="handleSubmit">
          
          <div class="form-group">
            <label for="customerName">Customer Name *</label>
            <input
              id="customerName"
              v-model="orderData.customerName"
              type="text"
              required
              placeholder="Enter customer name"
            />
          </div>

          <div class="form-group">
            <div class="checkbox-wrapper">
              <input
                id="includeEmail"
                v-model="includeEmail"
                type="checkbox"
                checked
              />
              <label for="includeEmail">Include email address</label>
            </div>
          </div>

          <div v-if="includeEmail" class="form-group">
            <label for="email">Email Address *</label>
            <input
              id="email"
              v-model="orderData.email"
              type="email"
              :required="includeEmail"
              placeholder="Enter email address"
            />
            <p class="hint">All tickets will be sent to this email</p>
          </div>

          <div class="tickets-section">
            <h3>Tickets in Order</h3>
            
            <div v-for="(ticket, index) in orderData.tickets" :key="index" class="ticket-line">
              <div class="ticket-line-header">
                <h4>Ticket {{ index + 1 }}</h4>
                <button
                  type="button"
                  @click="removeTicket(index)"
                  class="btn-remove-ticket"
                  :disabled="orderData.tickets.length === 1"
                  title="Remove ticket"
                >
                  ✕ Remove
                </button>
              </div>

              <div class="ticket-fields">
                <div class="form-group">
                  <label>Type *</label>
                  <select v-model="ticket.ticketType" @change="onTicketTypeChange(index)" required>
                    <option value="attendee">Attendee</option>
                    <option value="exhibitor">Exhibitor</option>
                    <option value="student">Student</option>
                  </select>
                </div>

                <div v-if="ticket.ticketType === 'attendee'" class="form-group">
                  <label>Subtype *</label>
                  <select v-model="ticket.ticketSubtype" required>
                    <option value="">Select subtype</option>
                    <option value="vip">VIP</option>
                    <option value="adult_2day">Adult 2-Day</option>
                    <option value="adult_saturday">Adult Saturday</option>
                    <option value="adult_sunday">Adult Sunday</option>
                    <option value="child_2day">Child 2-Day</option>
                    <option value="child_saturday">Child Saturday</option>
                    <option value="child_sunday">Child Sunday</option>
                    <option value="cymbal_summit">Cymbal Summit</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>Name *</label>
                  <input
                    v-model="ticket.name"
                    type="text"
                    required
                    :placeholder="getNamePlaceholder(ticket.ticketType)"
                  />
                </div>

                <div v-if="ticket.ticketType === 'student'" class="form-group">
                  <label>Teacher Name *</label>
                  <input
                    v-model="ticket.teacherName"
                    type="text"
                    required
                    placeholder="Enter teacher name"
                  />
                </div>

                <div class="form-group">
                  <label>Quantity *</label>
                  <input
                    v-model.number="ticket.quantity"
                    type="number"
                    min="1"
                    max="50"
                    required
                  />
                </div>

                <!-- Exhibitor Booth Range -->
                <div v-if="ticket.ticketType === 'exhibitor'" class="form-group">
                  <label>Booth(s) *</label>
                  <input
                    v-model="ticket.boothRange"
                    type="text"
                    required
                    placeholder="e.g., 101-104 or 205"
                  />
                  <p class="hint">{{ ticket.quantity }} booth{{ ticket.quantity > 1 ? 's' : '' }} required for {{ ticket.quantity }} ticket{{ ticket.quantity > 1 ? 's' : '' }}</p>
                </div>

                <!-- Exhibitor Supplies Section -->
                <div v-if="ticket.ticketType === 'exhibitor'" class="supplies-subsection">
                  <label>Included & Additional Supplies</label>
                  
                  <!-- Hardcoded Exhibitor Passes (greyed out) -->
                  <div class="supply-item supply-included">
                    <input
                      type="text"
                      value="Exhibitor Pass"
                      disabled
                      class="supply-included-input"
                    />
                    <input
                      type="number"
                      :value="ticket.quantity * 2"
                      disabled
                      class="supply-included-input"
                    />
                    <span class="supply-included-label">Included</span>
                  </div>

                  <!-- Additional supplies dropdown -->
                  <div v-for="(supply, supplyIndex) in ticket.supplies" :key="supplyIndex" class="supply-item">
                    <select
                      v-model="supply.name"
                      required
                    >
                      <option value="">Select supply</option>
                      <option value="Table">Table</option>
                      <option value="Black Table Drape">Black Table Drape</option>
                      <option value="Chair">Chair</option>
                      <option value="Extra Exhibitor Pass">Extra Exhibitor Pass</option>
                    </select>
                    <input
                      v-model.number="supply.quantity"
                      type="number"
                      min="1"
                      placeholder="Qty"
                      required
                    />
                    <button
                      type="button"
                      @click="removeSupply(index, supplyIndex)"
                      class="btn-remove-small"
                      :disabled="ticket.supplies.length === 1"
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    type="button"
                    @click="addSupply(index)"
                    class="btn-add-supply-small"
                  >
                    + Add Supply
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              @click="addTicket"
              class="btn-add-ticket"
            >
              + Add Another Ticket
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
              {{ loading ? 'Creating Order...' : `Create Order (${totalTickets} ticket${totalTickets > 1 ? 's' : ''})` }}
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
import { useAuthStore } from '@/stores/auth';

export default {
  name: 'AddTicket',
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const orderData = reactive({
      customerName: '',
      email: '',
      tickets: [{
        ticketType: 'attendee',
        ticketSubtype: '',
        name: '',
        teacherName: '',
        quantity: 1,
        boothRange: '',
        supplies: [{ name: '', quantity: 1 }]
      }]
    });

    const loading = ref(false);
    const error = ref('');
    const success = ref('');
    const includeEmail = ref(true);

    const totalTickets = computed(() => {
      return orderData.tickets.reduce((sum, ticket) => sum + (ticket.quantity || 0), 0);
    });

    const getNamePlaceholder = (ticketType) => {
      switch (ticketType) {
        case 'student': return 'Student name';
        case 'exhibitor': return 'Exhibitor/company name';
        case 'attendee': return 'Attendee name';
        default: return 'Enter name';
      }
    };

    const onTicketTypeChange = (index) => {
      const ticket = orderData.tickets[index];
      // Reset type-specific fields
      if (ticket.ticketType !== 'student') {
        ticket.teacherName = '';
      }
      if (ticket.ticketType !== 'exhibitor') {
        ticket.supplies = [{ name: '', quantity: 1 }];
        ticket.boothRange = '';
      }
      if (ticket.ticketType !== 'attendee') {
        ticket.ticketSubtype = '';
      }
    };

    const addTicket = () => {
      orderData.tickets.push({
        ticketType: 'attendee',
        ticketSubtype: '',
        name: '',
        teacherName: '',
        quantity: 1,
        boothRange: '',
        supplies: [{ name: '', quantity: 1 }]
      });
    };

    const removeTicket = (index) => {
      if (orderData.tickets.length > 1) {
        orderData.tickets.splice(index, 1);
      }
    };

    const addSupply = (ticketIndex) => {
      orderData.tickets[ticketIndex].supplies.push({ name: '', quantity: 1 });
    };

    const removeSupply = (ticketIndex, supplyIndex) => {
      if (orderData.tickets[ticketIndex].supplies.length > 1) {
        orderData.tickets[ticketIndex].supplies.splice(supplyIndex, 1);
      }
    };

    const handleSubmit = async () => {
      loading.value = true;
      error.value = '';
      success.value = '';

      try {
        const payload = {
          customerName: orderData.customerName,
          email: includeEmail.value ? orderData.email : null,
          tickets: orderData.tickets.map(ticket => {
            const t = {
              ticketType: ticket.ticketType,
              name: ticket.name,
              quantity: ticket.quantity
            };

            if (ticket.ticketType === 'student') {
              t.teacherName = ticket.teacherName;
            }

            if (ticket.ticketType === 'attendee') {
              t.ticketSubtype = ticket.ticketSubtype;
            }

            if (ticket.ticketType === 'exhibitor') {
              t.boothRange = ticket.boothRange;
              
              // Add base exhibitor passes (2x ticket quantity)
              const baseExhibitorPasses = ticket.quantity * 2;
              
              // Get extra exhibitor passes from supplies
              const extraPasses = ticket.supplies
                .filter(s => s.name === 'Extra Exhibitor Pass')
                .reduce((sum, s) => sum + (s.quantity || 0), 0);
              
              // Combine into total exhibitor passes
              const totalExhibitorPasses = baseExhibitorPasses + extraPasses;
              
              // Filter out extra exhibitor passes and add combined total
              const otherSupplies = ticket.supplies.filter(s => s.name.trim() !== '' && s.name !== 'Extra Exhibitor Pass');
              t.supplies = [
                { name: 'Exhibitor Pass', quantity: totalExhibitorPasses },
                ...otherSupplies
              ];
            }

            return t;
          })
        };

        const response = await axios.post('/api/tickets/create-order', payload);
        
        const ticketCount = response.data.ticketCount || totalTickets.value;
        if (response.data.warning) {
          success.value = `Order created with ${ticketCount} ticket(s), but email delivery failed. Please check email configuration.`;
        } else {
          success.value = `Order created successfully with ${ticketCount} ticket(s) and sent to ${orderData.email}!`;
        }

        // Reset form after success
        setTimeout(() => {
          resetForm();
          router.push('/tickets');
        }, 2000);
      } catch (err) {
        error.value = err.response?.data?.error || 'Failed to create order';
        console.error('Error creating order:', err);
      } finally {
        loading.value = false;
      }
    };

    const resetForm = () => {
      orderData.customerName = '';
      orderData.email = '';
      orderData.tickets = [{
        ticketType: 'attendee',
        ticketSubtype: '',
        name: '',
        teacherName: '',
        quantity: 1,
        boothRange: '',
        supplies: [{ name: '', quantity: 1 }]
      }];
      error.value = '';
      success.value = '';
    };

    const goBack = () => {
      router.push('/tickets');
    };

    return {
      orderData,
      loading,
      error,
      success,
      includeEmail,
      totalTickets,
      getNamePlaceholder,
      handleSubmit,
      onTicketTypeChange,
      addTicket,
      removeTicket,
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
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
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

.form-group {
  margin-bottom: 25px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

input, select {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 16px;
  box-sizing: border-box;
  background-color: white;
}

input:focus, select:focus {
  outline: none;
  border-color: #667eea;
}

.order-section {
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 30px;
  margin-bottom: 30px;
}

.tickets-section h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ticket-line {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 25px;
  margin-bottom: 20px;
}

.ticket-line-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.ticket-line-header h4 {
  margin: 0;
  color: #555;
  font-size: 16px;
  font-weight: 600;
}

.ticket-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.ticket-fields .form-group {
  margin-bottom: 0;
}

.full-width {
  grid-column: 1 / -1;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}

.checkbox-wrapper input[type="checkbox"] {
  width: auto;
  height: auto;
  cursor: pointer;
}

.checkbox-wrapper label {
  margin: 0;
  cursor: pointer;
  font-weight: 500;
}

.btn-remove {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-remove:hover:not(:disabled) {
  background: #c82333;
}

.btn-remove:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-remove-ticket {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-remove-ticket:hover:not(:disabled) {
  background: #c82333;
}

.btn-remove-ticket:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-add-ticket {
  background: #28a745;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}

.btn-add-ticket:hover {
  background: #218838;
}

.hint {
  margin: 5px 0 0 0;
  font-size: 13px;
  color: #666;
}

.supplies-subsection {
  grid-column: 1 / -1;
  margin-top: 10px;
  padding: 15px;
  background: white;
  border-radius: 5px;
  border: 1px solid #ddd;
}

.supplies-subsection label {
  display: block;
  margin-bottom: 10px;
  color: #555;
  font-size: 14px;
  font-weight: 600;
}

.supply-item {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  align-items: center;
}

.supply-item input[type="text"],
.supply-item select {
  flex: 2;
}

.supply-item input[type="number"] {
  flex: 0 0 80px;
}

.supply-included {
  background: #f8f9fa;
  padding: 8px;
  border-radius: 5px;
  border: 1px solid #e0e0e0;
}

.supply-included-input {
  background: #e9ecef !important;
  color: #6c757d !important;
  cursor: not-allowed;
}

.supply-included-label {
  color: #28a745;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  background: #d4edda;
  border-radius: 4px;
  flex: 0 0 auto;
}

.btn-remove-small {
  background: #dc3545;
  color: white;
  border: none;
  padding: 10px 12px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  flex: 0 0 auto;
}

.btn-remove-small:hover:not(:disabled) {
  background: #c82333;
}

.btn-remove-small:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-add-supply-small {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 5px;
}

.btn-add-supply-small:hover {
  background: #138496;
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
  padding-top: 30px;
  border-top: 2px solid #f0f0f0;
}

.form-actions button {
  flex: 1;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .container {
    padding: 15px;
  }

  .form-card {
    padding: 20px;
  }

  .form-card h2 {
    font-size: 20px;
  }

  .ticket-fields {
    grid-template-columns: 1fr;
  }

  .ticket-line {
    padding: 15px;
  }

  .supply-item {
    flex-direction: column;
    gap: 10px;
  }

  .supply-item .form-group,
  .supply-item .form-group:first-child,
  .supply-item .form-group:nth-child(2) {
    flex: 1;
    width: 100%;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions button {
    width: 100%;
  }
}
</style>
