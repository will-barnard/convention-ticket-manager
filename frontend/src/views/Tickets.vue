<template>
  <div class="tickets">
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
            @click="filterType = 'attendee'"
            :class="['type-tab', { active: filterType === 'attendee' }]"
          >
            <font-awesome-icon icon="calendar-day" />
            Attendees ({{ attendeeTickets }})
          </button>
          <button
            @click="filterType = 'exhibitor'"
            :class="['type-tab', { active: filterType === 'exhibitor' }]"
          >
            <font-awesome-icon icon="building" />
            Exhibitors ({{ exhibitorTickets }})
          </button>
          <button
            @click="filterType = 'student'"
            :class="['type-tab', { active: filterType === 'student' }]"
          >
            <font-awesome-icon icon="graduation-cap" />
            Students ({{ studentTickets }})
          </button>
        </div>

        <div class="search-bar">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, email, teacher, or order ID..."
            class="search-input"
          />
          <font-awesome-icon icon="search" class="search-icon" />
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
                <th v-if="filterType === 'student'">Teacher</th>
                <th v-if="filterType === 'attendee'">Check-in Status</th>
                <th>Email</th>
                <th v-if="filterType !== 'attendee'">Status</th>
                <th>Validity</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in groupedTickets" :key="group.orderId">
                <!-- Order Header Row (or single exhibitor row) -->
                <tr class="order-row" :class="{ 'exhibitor-single': filterType === 'exhibitor' }" @click="filterType === 'exhibitor' ? null : toggleOrder(group.orderId)">
                  <td>
                    <div class="order-header">
                      <font-awesome-icon 
                        v-if="filterType !== 'exhibitor'"
                        :icon="isOrderExpanded(group.orderId) ? 'chevron-down' : 'chevron-right'" 
                        class="expand-icon"
                      />
                      <span v-if="filterType !== 'exhibitor'" class="order-badge" :class="{ 'manual': !group.isShopifyOrder }">
                        <font-awesome-icon :icon="group.isShopifyOrder ? 'shopping-cart' : 'hand-point-right'" />
                        {{ group.isShopifyOrder ? 'Order' : 'Manual' }}
                      </span>
                      <span v-else :class="['badge', 'exhibitor']">
                        {{ formatTicketType('exhibitor') }}
                      </span>
                    </div>
                  </td>
                  <td>
                    <strong>{{ group.customerName }}</strong>
                    <span class="ticket-count" v-if="filterType === 'exhibitor'">
                      ({{ group.tickets[0].quantity || 1 }} booth{{ (group.tickets[0].quantity || 1) > 1 ? 's' : '' }})
                    </span>
                  </td>
                  <td v-if="filterType === 'student'"></td>
                  <td v-if="filterType === 'attendee'"></td>
                  <td>{{ group.customerEmail }}</td>
                  <td v-if="filterType !== 'attendee'">
                    <span v-if="filterType === 'exhibitor'" :class="['status', { used: group.tickets[0].is_used }]">
                      {{ group.tickets[0].is_used ? 'Used' : 'Available' }}
                    </span>
                  </td>
                  <td>
                    <select 
                      v-if="filterType === 'exhibitor'"
                      :value="group.tickets[0].status || 'valid'" 
                      @change="updateTicketStatus(group.tickets[0].id, $event.target.value)"
                      :class="['status-select', group.tickets[0].status || 'valid']"
                    >
                      <option value="valid">✓ Valid</option>
                      <option value="invalid">✗ Invalid</option>
                      <option value="refunded">↩ Refunded</option>
                      <option value="cancelled">✖ Cancelled</option>
                      <option value="chargeback">⚠ Chargeback</option>
                    </select>
                  </td>
                  <td>{{ formatDate(group.tickets[0].created_at) }}</td>
                  <td>
                    <div class="order-actions">
                      <button 
                        v-if="filterType === 'exhibitor'"
                        @click.stop="openExhibitorModal(group)"
                        class="btn-show-details"
                      >
                        Show Details
                      </button>
                      <button 
                        v-else-if="(authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin') && group.tickets.length > 1 && group.tickets.some(t => !t.email_sent)"
                        @click.stop="sendAllTicketsEmail(group)"
                        class="btn-send-all"
                        title="Send all tickets in one email"
                      >
                        Send All ({{ group.tickets.filter(t => !t.email_sent).length }})
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Individual Ticket Rows (when expanded) - Not shown for exhibitors -->
                <template v-if="filterType !== 'exhibitor' && isOrderExpanded(group.orderId)">
                  <tr v-for="ticket in group.tickets" :key="ticket.id" class="ticket-row">
                    <td>
                      <span :class="['badge', ticket.ticket_type]">
                        {{ formatTicketType(ticket.ticket_type) }}
                      </span>
                      <div v-if="ticket.ticket_type === 'attendee' && ticket.ticket_subtype" class="ticket-subtype">
                        {{ formatAttendeeSubtype(ticket.ticket_subtype) }}
                      </div>
                    </td>
                    <td>{{ ticket.name }}</td>
                    <td v-if="filterType === 'student'">{{ ticket.teacher_name || '-' }}</td>
                    <td v-if="filterType === 'attendee'">
                      <div class="scan-status">
                        <span v-if="ticket.scans?.scanned" class="scanned">
                          <font-awesome-icon icon="check-circle" class="check-icon" />
                          Scanned {{ formatScanDate(ticket.scans.scannedOn) }}
                          <span v-if="ticket.scans.scannedBy" class="scanner-info">
                            by {{ ticket.scans.scannedBy.username }}
                          </span>
                        </span>
                        <span v-else class="not-scanned">Not Scanned</span>
                      </div>
                    </td>
                    <td>{{ ticket.email }}</td>
                    <td v-if="filterType !== 'attendee'">
                      <span :class="['status', { used: ticket.is_used }]">
                        {{ ticket.is_used ? 'Used' : 'Available' }}
                      </span>
                    </td>
                    <td>
                      <select 
                        :value="ticket.status || 'valid'" 
                        @change="updateTicketStatus(ticket.id, $event.target.value)"
                        :class="['status-select', ticket.status || 'valid']"
                      >
                        <option value="valid">✓ Valid</option>
                        <option value="invalid">✗ Invalid</option>
                        <option value="refunded">↩ Refunded</option>
                        <option value="cancelled">✖ Cancelled</option>
                        <option value="chargeback">⚠ Chargeback</option>
                      </select>
                    </td>
                    <td>{{ formatDate(ticket.created_at) }}</td>
                    <td>
                      <div class="actions-cell">
                        <button 
                          v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin'" 
                          @click="openEditModal(ticket)" 
                          class="btn-edit"
                          title="Edit Ticket"
                        >
                          Edit
                        </button>
                        <button 
                          v-if="(authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin') && !ticket.email_sent" 
                          @click="sendTicketEmail(ticket.id)" 
                          class="btn-send-email"
                          title="Send Ticket Email"
                        >
                          Send Email
                        </button>
                        <button 
                          v-if="(authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin') && ticket.ticket_type === 'attendee'" 
                          @click="toggleScanStatus(ticket)" 
                          :class="['btn-scan', { scanned: ticket.scans?.scanned }]"
                          :title="ticket.scans?.scanned ? 'Mark as Not Scanned' : 'Mark as Scanned'"
                        >
                          {{ ticket.scans?.scanned ? 'Unmark Scan' : 'Mark Scanned' }}
                        </button>
                        <button @click="deleteTicket(ticket.id)" class="btn-delete">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Exhibitor Details Modal -->
    <div v-if="viewingExhibitorOrder" class="modal-overlay" @click="closeExhibitorModal">
      <div class="modal-content exhibitor-modal" @click.stop>
        <div class="modal-header">
          <h2>Exhibitor Order Details</h2>
          <button @click="closeExhibitorModal" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <div class="exhibitor-info">
            <div class="info-row">
              <strong>Exhibitor Name:</strong>
              <span>{{ viewingExhibitorOrder.customerName }}</span>
            </div>
            <div class="info-row">
              <strong>Email:</strong>
              <span>{{ viewingExhibitorOrder.customerEmail }}</span>
            </div>
            <div class="info-row">
              <strong>Order Type:</strong>
              <span v-if="viewingExhibitorOrder.isShopifyOrder">
                <font-awesome-icon icon="shopping-cart" /> Shopify Order
              </span>
              <span v-else>
                <font-awesome-icon icon="hand-point-right" /> Manual Order
              </span>
            </div>
            <div class="info-row">
              <strong>Total Booths:</strong>
              <span>{{ viewingExhibitorOrder.tickets[0].quantity || 1 }}</span>
            </div>
            <div class="info-row">
              <strong>Booth Range:</strong>
              <span>{{ viewingExhibitorOrder.tickets[0].booth_range || 'Not specified' }}</span>
            </div>
            <div class="info-row">
              <strong>Exhibitor Passes Included:</strong>
              <span>{{ (viewingExhibitorOrder.tickets[0].quantity || 1) * 2 }}</span>
            </div>
            <div class="info-row">
              <strong>Status:</strong>
              <span :class="['status', { used: viewingExhibitorOrder.tickets[0].is_used }]">
                {{ viewingExhibitorOrder.tickets[0].is_used ? 'Used' : 'Available' }}
              </span>
            </div>
            <div class="info-row">
              <strong>Validity:</strong>
              <select 
                :value="viewingExhibitorOrder.tickets[0].status || 'valid'" 
                @change="updateTicketStatus(viewingExhibitorOrder.tickets[0].id, $event.target.value)"
                :class="['status-select', viewingExhibitorOrder.tickets[0].status || 'valid']"
              >
                <option value="valid">✓ Valid</option>
                <option value="invalid">✗ Invalid</option>
                <option value="refunded">↩ Refunded</option>
                <option value="cancelled">✖ Cancelled</option>
                <option value="chargeback">⚠ Chargeback</option>
              </select>
            </div>
            <div class="info-row">
              <strong>Email Sent:</strong>
              <span v-if="viewingExhibitorOrder.tickets[0].email_sent" class="email-sent">✓ Yes</span>
              <span v-else class="email-not-sent">✗ Not yet</span>
            </div>
            <div class="info-row">
              <strong>Created:</strong>
              <span>{{ formatDate(viewingExhibitorOrder.tickets[0].created_at) }}</span>
            </div>
          </div>

          <div class="supplies-section" v-if="viewingExhibitorOrder.tickets[0].supplies && viewingExhibitorOrder.tickets[0].supplies.length > 0">
            <h3>Supplies</h3>
            <table class="supplies-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="supply in viewingExhibitorOrder.tickets[0].supplies" :key="supply.name">
                  <td>{{ supply.name }}</td>
                  <td>{{ supply.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="qr-section">
            <h3>QR Code</h3>
            <p class="qr-info">Single QR code for all {{ viewingExhibitorOrder.tickets[0].quantity || 1 }} booth{{ (viewingExhibitorOrder.tickets[0].quantity || 1) > 1 ? 's' : '' }}</p>
            <div class="qr-code-display">
              <code>{{ viewingExhibitorOrder.tickets[0].uuid }}</code>
            </div>
          </div>

          <div class="modal-actions">
            <button 
              v-if="(authStore.user?.role === 'admin' || authStore.user?.role === 'superadmin') && !viewingExhibitorOrder.tickets[0].email_sent"
              @click="sendTicketEmail(viewingExhibitorOrder.tickets[0].id)"
              class="btn-primary"
            >
              Send Ticket Email
            </button>
            <button @click="closeExhibitorModal" class="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Ticket Modal -->
    <div v-if="editingTicket" class="modal-overlay" @click="closeEditModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Edit Ticket</h2>
          <button @click="closeEditModal" class="btn-close">×</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveTicketEdits">
            <div class="form-group">
              <label>Name</label>
              <input type="text" v-model="editForm.name" required />
            </div>
            
            <div class="form-group">
              <label>Email</label>
              <input type="email" v-model="editForm.email" required />
            </div>
            
            <div v-if="editForm.ticket_type === 'student'" class="form-group">
              <label>Teacher Name</label>
              <input type="text" v-model="editForm.teacher_name" />
            </div>
            
            <div v-if="editForm.ticket_type === 'attendee'" class="form-group">
              <label>Ticket Subtype</label>
              <select v-model="editForm.ticket_subtype" required>
                <option value="vip">VIP Pass</option>
                <option value="adult_2day">Adult 2-Day Pass</option>
                <option value="adult_saturday">Adult Saturday Pass</option>
                <option value="adult_sunday">Adult Sunday Pass</option>
                <option value="child_2day">Child 2-Day Pass</option>
                <option value="child_saturday">Child Saturday Pass</option>
                <option value="child_sunday">Child Sunday Pass</option>
                <option value="cymbal_summit">Indie Cymbalsmith Event Ticket (Friday Only)</option>
              </select>
            </div>
            
            <div class="form-actions">
              <button type="button" @click="closeEditModal" class="btn-secondary">
                Cancel
              </button>
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </form>
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
  name: 'Tickets',
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
    const filterType = ref('attendee');
    const searchQuery = ref('');
    const editingTicket = ref(null);
    const saving = ref(false);
    const expandedOrders = ref(new Set());
    const viewingExhibitorOrder = ref(null);
    const editForm = ref({
      name: '',
      email: '',
      teacher_name: '',
      ticket_type: '',
      ticket_subtype: ''
    });

    const studentTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'student').length
    );

    const exhibitorTickets = computed(() => {
      // Count individual exhibitor tickets (each is one exhibitor)
      return tickets.value.filter(t => t.ticket_type === 'exhibitor').length;
    });

    const attendeeTickets = computed(() => 
      tickets.value.filter(t => t.ticket_type === 'attendee').length
    );

    const filteredTickets = computed(() => {
      let filtered = tickets.value.filter(t => t.ticket_type === filterType.value);
      
      if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase().trim();
        filtered = filtered.filter(ticket => {
          return (
            ticket.name?.toLowerCase().includes(query) ||
            ticket.email?.toLowerCase().includes(query) ||
            ticket.teacher_name?.toLowerCase().includes(query) ||
            ticket.shopify_order_id?.toLowerCase().includes(query) ||
            ticket.uuid?.toLowerCase().includes(query)
          );
        });
      }
      
      return filtered;
    });

    // Group tickets by order ID
    const groupedTickets = computed(() => {
      const groups = {};
      
      // For exhibitor tickets, don't group - show individual tickets with quantity
      if (filterType.value === 'exhibitor') {
        return filteredTickets.value.map(ticket => ({
          orderId: ticket.shopify_order_id || `manual-${ticket.id}`,
          isShopifyOrder: !!ticket.shopify_order_id,
          tickets: [ticket],
          customerName: ticket.name,
          customerEmail: ticket.email,
          isSingleExhibitor: true
        })).sort((a, b) => {
          const aDate = new Date(a.tickets[0].created_at);
          const bDate = new Date(b.tickets[0].created_at);
          return bDate - aDate;
        });
      }
      
      // For other ticket types, group by order ID
      filteredTickets.value.forEach(ticket => {
        const orderId = ticket.shopify_order_id || `manual-${ticket.id}`;
        if (!groups[orderId]) {
          groups[orderId] = {
            orderId,
            isShopifyOrder: !!ticket.shopify_order_id,
            tickets: [],
            customerName: ticket.name,
            customerEmail: ticket.email
          };
        }
        groups[orderId].tickets.push(ticket);
      });
      
      // Convert to array and sort by most recent
      return Object.values(groups).sort((a, b) => {
        const aDate = new Date(a.tickets[0].created_at);
        const bDate = new Date(b.tickets[0].created_at);
        return bDate - aDate;
      });
    });

    const toggleOrder = (orderId) => {
      if (expandedOrders.value.has(orderId)) {
        expandedOrders.value.delete(orderId);
      } else {
        expandedOrders.value.add(orderId);
      }
    };

    const isOrderExpanded = (orderId) => {
      return expandedOrders.value.has(orderId);
    };

    const loadTickets = async () => {
      loading.value = true;
      error.value = '';
      
      try {
        const response = await axios.get('/api/tickets');
        tickets.value = response.data.tickets || response.data;
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

    const updateTicketStatus = async (id, status) => {
      try {
        await axios.patch(`/api/tickets/${id}/status`, { status });
        
        // Update local ticket status
        const ticket = tickets.value.find(t => t.id === id);
        if (ticket) {
          ticket.status = status;
        }
      } catch (err) {
        console.error('Error updating ticket status:', err);
        alert('Failed to update ticket status. Please try again.');
        // Reload tickets to revert the change
        loadTickets();
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

    const formatAttendeeSubtype = (subtype) => {
      const subtypes = {
        vip: 'VIP',
        adult_2day: 'Adult 2-Day',
        adult_saturday: 'Adult Saturday',
        adult_sunday: 'Adult Sunday',
        child_2day: 'Child 2-Day',
        child_saturday: 'Child Saturday',
        child_sunday: 'Child Sunday',
        cymbal_summit: 'Cymbal Summit'
      };
      return subtypes[subtype] || subtype;
    };

    const formatScanDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
    };

    const goToAddTicket = () => {
      router.push('/add-ticket');
    };

    const openEditModal = (ticket) => {
      editingTicket.value = ticket;
      editForm.value = {
        name: ticket.name,
        email: ticket.email,
        teacher_name: ticket.teacher_name || '',
        ticket_type: ticket.ticket_type,
        ticket_subtype: ticket.ticket_subtype || ''
      };
    };

    const closeEditModal = () => {
      editingTicket.value = null;
      editForm.value = {
        name: '',
        email: '',
        teacher_name: '',
        ticket_type: '',
        ticket_subtype: ''
      };
    };

    const openExhibitorModal = (group) => {
      viewingExhibitorOrder.value = group;
    };

    const closeExhibitorModal = () => {
      viewingExhibitorOrder.value = null;
    };

    const saveTicketEdits = async () => {
      saving.value = true;
      
      try {
        await axios.put(`/api/tickets/${editingTicket.value.id}`, editForm.value);
        
        // Update local ticket data
        const ticket = tickets.value.find(t => t.id === editingTicket.value.id);
        if (ticket) {
          ticket.name = editForm.value.name;
          ticket.email = editForm.value.email;
          ticket.teacher_name = editForm.value.teacher_name;
          ticket.ticket_subtype = editForm.value.ticket_subtype;
        }
        
        closeEditModal();
      } catch (err) {
        console.error('Error updating ticket:', err);
        alert('Failed to update ticket. Please try again.');
      } finally {
        saving.value = false;
      }
    };

    const toggleScanStatus = async (ticket) => {
      const action = ticket.scans?.scanned ? 'unmark' : 'mark';
      const confirmMsg = ticket.scans?.scanned 
        ? 'Mark this ticket as NOT scanned? This will remove the scan record.'
        : 'Mark this ticket as scanned? This will add a scan record with the current timestamp.';
      
      if (!confirm(confirmMsg)) {
        return;
      }
      
      try {
        await axios.post(`/api/tickets/${ticket.id}/scan-status`, { action });
        
        // Reload tickets to get updated scan status
        await loadTickets();
      } catch (err) {
        console.error('Error toggling scan status:', err);
        alert('Failed to update scan status. Please try again.');
      }
    };

    const sendTicketEmail = async (ticketId) => {
      if (!confirm('Send the ticket email to this recipient?')) {
        return;
      }
      
      try {
        await axios.post(`/api/tickets/${ticketId}/send-email`);
        alert('Ticket email sent successfully!');
        
        // Reload tickets to update email_sent status
        await loadTickets();
      } catch (err) {
        console.error('Error sending ticket email:', err);
        alert('Failed to send ticket email. Please try again.');
      }
    };

    const sendAllTicketsEmail = async (group) => {
      const unsentCount = group.tickets.filter(t => !t.email_sent).length;
      if (!confirm(`Send all ${unsentCount} unsent ticket(s) in one consolidated email to ${group.customerEmail}?`)) {
        return;
      }
      
      try {
        // Get all unsent ticket IDs from this order
        const ticketIds = group.tickets.filter(t => !t.email_sent).map(t => t.id);
        
        await axios.post(`/api/tickets/send-order-email`, { 
          ticketIds,
          customerName: group.customerName,
          customerEmail: group.customerEmail
        });
        
        alert(`Consolidated email with ${unsentCount} ticket(s) sent successfully!`);
        
        // Reload tickets to update email_sent status
        await loadTickets();
      } catch (err) {
        console.error('Error sending order email:', err);
        alert('Failed to send order email. Please try again.');
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
      loadTickets();
    });

    return {
      authStore,
      tickets,
      loading,
      error,
      isChangePasswordOpen,
      filterType,
      searchQuery,
      editingTicket,
      editForm,
      saving,
      viewingExhibitorOrder,
      studentTickets,
      exhibitorTickets,
      attendeeTickets,
      filteredTickets,
      loadTickets,
      deleteTicket,
      updateTicketStatus,
      openEditModal,
      closeEditModal,
      openExhibitorModal,
      closeExhibitorModal,
      saveTicketEdits,
      toggleScanStatus,
      sendTicketEmail,
      sendAllTicketsEmail,
      formatDate,
      formatTicketType,
      formatAttendeeSubtype,
      formatScanDate,
      goToAddTicket,
      showChangePassword,
      handleLogout,
      groupedTickets,
      toggleOrder,
      isOrderExpanded,
    };
  },
};
</script>

<style scoped>
.tickets {
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

.search-bar {
  position: relative;
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  padding: 12px 40px 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
  pointer-events: none;
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

.ticket-subtype {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  font-weight: 500;
}

.order-row {
  background: #f8f9fa;
  cursor: pointer;
  font-weight: 500;
}

.order-row:hover {
  background: #e9ecef !important;
}

.order-row td {
  border-bottom: 2px solid #dee2e6;
}

.ticket-row td {
  padding-left: 30px;
}

.ticket-row:hover td {
  background: #f1f3f5;
}

.order-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.expand-icon {
  color: #667eea;
  transition: transform 0.2s;
}

.order-badge {
  background: #667eea;
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.order-badge.manual {
  background: #95a5a6;
}

.ticket-count {
  color: #666;
  font-weight: 400;
  font-size: 13px;
}

.order-actions {
  display: flex;
  gap: 8px;
}

.btn-send-all {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-send-all:hover {
  background: #218838;
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

.actions-cell {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-edit {
  background: #667eea;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-edit:hover {
  background: #5568d3;
}

.btn-scan {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-scan:hover {
  background: #218838;
}

.btn-scan.scanned {
  background: #ffc107;
  color: #333;
}

.btn-scan.scanned:hover {
  background: #e0a800;
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

.btn-send-email {
  padding: 8px 12px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-send-email:hover {
  background: #1976D2;
}

.scan-status {
  text-align: center;
  font-size: 13px;
}

.scan-status .scanned {
  color: #2e7d32;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.scanner-info {
  font-size: 11px;
  color: #666;
  font-weight: 400;
  font-style: italic;
}

.scan-status .check-icon {
  color: #4CAF50;
  font-size: 16px;
}

.scan-status .not-scanned {
  color: #999;
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

.status-select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 2px solid #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.status-select.valid {
  background: #d4edda;
  color: #155724;
  border-color: #c3e6cb;
}

.status-select.invalid {
  background: #f8d7da;
  color: #721c24;
  border-color: #f5c6cb;
}

.status-select.refunded {
  background: #fff3cd;
  color: #856404;
  border-color: #ffeaa7;
}

.status-select.cancelled {
  background: #e8e8e8;
  color: #424242;
  border-color: #bdbdbd;
}

.status-select.chargeback {
  background: #f8d7da;
  color: #721c24;
  border-color: #f5c6cb;
}

.status-select:hover {
  opacity: 0.8;
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
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
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

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #555;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
}

/* Exhibitor Modal Styles */
.exhibitor-modal {
  max-width: 900px;
}

.exhibitor-info {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 0;
  border-bottom: 1px solid #e0e0e0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row strong {
  color: #555;
  font-weight: 600;
}

.info-row span {
  color: #333;
}

.supplies-section,
.tickets-section {
  margin-bottom: 1.5rem;
}

.supplies-section h3,
.tickets-section h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.2rem;
}

.supplies-table,
.tickets-detail-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
}

.supplies-table th,
.supplies-table td,
.tickets-detail-table th,
.tickets-detail-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.supplies-table th,
.tickets-detail-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #555;
}

.tickets-detail-table code {
  background: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.email-sent {
  color: #28a745;
}

.email-not-sent {
  color: #dc3545;
}

.btn-send-email-small {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-send-email-small:hover {
  background: #138496;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
  justify-content: flex-end;
}

.btn-show-details {
  background: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-show-details:hover {
  background: #5568d3;
}

.exhibitor-order {
  cursor: default;
}

.exhibitor-order .expand-icon {
  display: none;
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

  .ticket-type-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    gap: 8px;
  }

  .ticket-type-tabs::-webkit-scrollbar {
    display: none;
  }

  .type-tab {
    padding: 10px 16px;
    font-size: 13px;
    white-space: nowrap;
  }

  .actions-bar {
    flex-direction: column;
    gap: 10px;
  }

  .actions-bar button {
    width: 100%;
  }

  .tickets-table {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tickets-table table {
    min-width: 800px;
  }

  .checkin-boxes {
    flex-wrap: nowrap;
  }

  .checkin-box {
    width: 45px;
    height: 45px;
  }

  .checkin-box .day-label {
    font-size: 10px;
  }

  .checkin-box .check-icon {
    font-size: 16px;
  }
}
</style>
