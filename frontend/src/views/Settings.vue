<template>
  <div class="settings">
    <header class="header">
      <h1>Convention Settings</h1>
    </header>

    <div class="container">
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
                <button type="button" @click="removeLogo" class="btn-remove-logo">
                  ✕ Remove Logo
                </button>
              </div>
              <div v-else class="logo-placeholder">
                <p>📷 No logo uploaded</p>
              </div>
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
        <h2>Future Settings</h2>
        <p class="placeholder-text">Additional settings will be added here in future updates.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import axios from 'axios';

export default {
  name: 'Settings',
  setup() {
    const settings = ref({
      convention_name: '',
      logo_url: null
    });
    const logoPreview = ref(null);
    const logoInput = ref(null);
    const logoFile = ref(null);
    const saving = ref(false);
    const message = ref('');
    const messageType = ref('');

    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/settings');
        settings.value = response.data;
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
        // Save convention name
        await axios.put('/api/settings', {
          convention_name: settings.value.convention_name
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

    const getLogoUrl = (logoUrl) => {
      if (!logoUrl) return '';
      return logoUrl.startsWith('http') ? logoUrl : `http://localhost:3000${logoUrl}`;
    };

    onMounted(() => {
      fetchSettings();
    });

    return {
      settings,
      logoPreview,
      logoInput,
      saving,
      message,
      messageType,
      handleLogoSelect,
      removeLogo,
      saveSettings,
      getLogoUrl
    };
  }
};
</script>

<style scoped>
.settings {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  background: rgba(255, 255, 255, 0.1);
  padding: 2rem;
  text-align: center;
  backdrop-filter: blur(10px);
}

.header h1 {
  color: white;
  margin: 0;
  font-size: 2rem;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
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

.form-group input[type="text"]:focus {
  outline: none;
  border-color: #667eea;
}

.logo-upload-area {
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
}

.logo-preview {
  position: relative;
  display: inline-block;
  margin-bottom: 1rem;
}

.logo-preview img {
  max-width: 300px;
  max-height: 200px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-remove-logo {
  position: absolute;
  top: -10px;
  right: -10px;
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  margin-top: 1rem;
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

.placeholder-text {
  color: #999;
  font-style: italic;
}
</style>
