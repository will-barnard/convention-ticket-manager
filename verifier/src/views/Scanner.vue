<template>
  <div class="scanner">
    <header class="header">
      <button @click="goBack" class="btn-back">← Back</button>
      <h1>Scan Ticket</h1>
      <div class="spacer"></div>
    </header>

    <div class="container">
      <div v-if="!cameraActive" class="camera-prompt">
        <p>Click the button below to activate your camera and scan QR codes</p>
        <button @click="startCamera" class="btn-camera">
          📷 Activate Camera
        </button>
      </div>

      <div v-if="cameraActive" class="camera-modal">
        <div class="camera-modal-content">
          <div class="camera-container" :class="{ 'scan-success': scanFlash }">
            <video ref="videoElement" autoplay playsinline></video>
            <div class="scanner-overlay">
              <div class="scanner-box"></div>
            </div>
          </div>
          <p class="camera-hint">Position QR code within the frame</p>
          <button @click="stopCamera" class="btn-stop">Close Camera</button>

          <!-- Show verification result below camera -->
          <div v-if="verificationResult" class="result-card" :class="resultClass">
            <div class="result-icon">{{ resultIcon }}</div>
            <h2>{{ resultTitle }}</h2>
            
            <div v-if="ticketData" class="ticket-details">
              <div class="detail-row">
                <span class="label">Name:</span>
                <span class="value">{{ ticketData.name }}</span>
              </div>
              <div v-if="ticketData.ticketType" class="detail-row">
                <span class="label">Type:</span>
                <span class="value badge" :class="ticketData.ticketType">
                  {{ formatTicketType(ticketData.ticketType, ticketData.ticketSubtype) }}
                </span>
              </div>
              <div v-if="ticketData.day" class="detail-row">
                <span class="label">Day:</span>
                <span class="value">{{ formatDay(ticketData.day) }}</span>
              </div>
              <div v-if="ticketData.allowedDays && ticketData.allowedDays.length > 0" class="detail-row">
                <span class="label">Allowed Days:</span>
                <span class="value">{{ formatAllowedDays(ticketData.allowedDays) }}</span>
              </div>
              <div v-if="ticketData.teacherName" class="detail-row">
                <span class="label">Teacher:</span>
                <span class="value">{{ ticketData.teacherName }}</span>
              </div>
              
              <div v-if="ticketData.supplies && ticketData.supplies.length > 0" class="supplies-section">
                <h3>Supplies Provided:</h3>
                <ul class="supplies-list">
                  <li v-for="supply in ticketData.supplies" :key="supply.id">
                    <span class="supply-name">{{ supply.supply_name }}</span>
                    <span class="supply-qty">x{{ supply.quantity }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <p v-if="resultMessage" class="result-message">{{ resultMessage }}</p>

            <button @click="resetScanner" class="btn-reset">
              Scan Another Ticket
            </button>
          </div>

          <!-- Show error below camera -->
          <div v-if="error" class="error-card">
            <p>{{ error }}</p>
            <button @click="clearError" class="btn-retry">Try Again</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import jsQR from 'jsqr';

export default {
  name: 'Scanner',
  setup() {
    const router = useRouter();
    const authStore = useAuthStore();

    const videoElement = ref(null);
    const cameraActive = ref(false);
    const verificationResult = ref(null);
    const ticketData = ref(null);
    const error = ref('');
    const stream = ref(null);
    const animationFrame = ref(null);
    const scanFlash = ref(false);

    const resultClass = ref('');
    const resultIcon = ref('');
    const resultTitle = ref('');
    const resultMessage = ref('');

    const startCamera = async () => {
      try {
        error.value = '';
        console.log('Starting camera...');
        
        // Check if mediaDevices is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          error.value = 'Camera API not supported. Please use HTTPS or a modern browser.';
          return;
        }

        // iOS-friendly constraints
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        console.log('Requesting camera access...');
        stream.value = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera stream obtained:', stream.value);
        
        // Set camera active first so the video element gets rendered
        cameraActive.value = true;
        
        // Wait for next tick to ensure video element is in DOM
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Video element ref:', videoElement.value);
        
        if (videoElement.value) {
          videoElement.value.srcObject = stream.value;
          console.log('Camera activated, video element set');
          
          // Wait for video to be ready before scanning
          videoElement.value.onloadedmetadata = () => {
            console.log('Video metadata loaded, starting playback');
            videoElement.value.play();
            scanQRCode();
          };
        } else {
          console.error('Video element not found in DOM!');
          error.value = 'Unable to initialize video element. Please try again.';
        }
      } catch (err) {
        console.error('Camera error:', err);
        
        // Provide specific error messages
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          error.value = '❌ Camera access denied. Please enable camera permissions in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          error.value = '❌ No camera found on this device.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          error.value = '❌ Camera is already in use by another app. Please close other apps and try again.';
        } else if (err.name === 'OverconstrainedError') {
          error.value = '❌ Camera constraints not supported. Trying alternative...';
          // Retry with simpler constraints
          retryWithBasicConstraints();
        } else if (err.name === 'NotSupportedError') {
          error.value = '⚠️ Camera access requires HTTPS. Please access this app via https:// instead of http://';
        } else if (err.name === 'TypeError') {
          error.value = '⚠️ Camera access requires HTTPS connection. This app must be accessed via https:// on iOS devices.';
        } else {
          error.value = `❌ Unable to access camera: ${err.message || 'Unknown error'}. On iOS, this app requires HTTPS.`;
        }
      }
    };

    const retryWithBasicConstraints = async () => {
      try {
        stream.value = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        
        if (videoElement.value) {
          videoElement.value.srcObject = stream.value;
          cameraActive.value = true;
          videoElement.value.onloadedmetadata = () => {
            videoElement.value.play();
            scanQRCode();
          };
          error.value = '';
        }
      } catch (retryErr) {
        console.error('Retry failed:', retryErr);
        error.value = '❌ Camera access failed. Please check browser permissions and ensure you are using HTTPS.';
      }
    };

    const stopCamera = () => {
      if (stream.value) {
        stream.value.getTracks().forEach(track => track.stop());
        stream.value = null;
      }
      if (animationFrame.value) {
        cancelAnimationFrame(animationFrame.value);
      }
      cameraActive.value = false;
    };

    const scanQRCode = () => {
      if (!cameraActive.value || !videoElement.value) return;

      const video = videoElement.value;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      const scan = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code) {
            handleQRCode(code.data);
            return;
          }
        }

        animationFrame.value = requestAnimationFrame(scan);
      };

      scan();
    };

    const handleQRCode = async (data) => {
      // Trigger green flash animation
      scanFlash.value = true;
      setTimeout(() => {
        scanFlash.value = false;
      }, 500);

      // Pause scanning while verifying (but keep camera running)
      if (animationFrame.value) {
        cancelAnimationFrame(animationFrame.value);
      }
      
      // Extract UUID from QR code data
      // Assuming QR code contains URL like: http://domain/verify/UUID
      const uuidMatch = data.match(/\/verify\/([a-f0-9-]+)/i);
      
      if (!uuidMatch) {
        error.value = 'Invalid QR code format';
        // Resume scanning after error
        setTimeout(() => {
          error.value = '';
          scanQRCode();
        }, 2000);
        return;
      }

      const uuid = uuidMatch[1];
      await verifyTicket(uuid);
    };

    const verifyTicket = async (uuid) => {
      try {
        const response = await axios.get(`/api/verify/${uuid}`);
        const result = response.data;

        verificationResult.value = result.status;
        ticketData.value = result;

        if (result.status === 'valid') {
          resultClass.value = 'success';
          resultIcon.value = '✓';
          resultTitle.value = 'Access Granted!';
          resultMessage.value = 'Ticket verified successfully';
        } else if (result.status === 'already_used') {
          resultClass.value = 'warning';
          resultIcon.value = '⚠';
          resultTitle.value = 'Already Used';
          resultMessage.value = 'This ticket has already been scanned';
        } else if (result.status === 'already_scanned_today') {
          resultClass.value = 'warning';
          resultIcon.value = '⚠';
          resultTitle.value = 'Already Scanned Today';
          resultMessage.value = result.message || 'This ticket has already been scanned today';
        } else if (result.status === 'wrong_date') {
          resultClass.value = 'error';
          resultIcon.value = '✕';
          resultTitle.value = 'Wrong Date';
          resultMessage.value = result.message || 'This ticket is not valid today';
        } else {
          resultClass.value = 'error';
          resultIcon.value = '✕';
          resultTitle.value = 'Invalid Ticket';
          resultMessage.value = result.message || 'This ticket is not valid';
        }
      } catch (err) {
        console.error('Verification error:', err);
        error.value = 'Failed to verify ticket. Please try again.';
      }
    };

    const resetScanner = () => {
      verificationResult.value = null;
      ticketData.value = null;
      error.value = '';
      resultClass.value = '';
      resultIcon.value = '';
      resultTitle.value = '';
      resultMessage.value = '';
      scanFlash.value = false;
      
      // Resume scanning
      if (cameraActive.value) {
        scanQRCode();
      }
    };

    const clearError = () => {
      error.value = '';
      // Resume scanning after clearing error
      if (cameraActive.value) {
        scanQRCode();
      }
    };

    const formatTicketType = (type, subtype) => {
      const types = {
        student: 'Student',
        exhibitor: 'Exhibitor',
        attendee: 'Attendee'
      };
      
      const subtypes = {
        vip: 'VIP',
        adult_2day: 'Adult 2-Day',
        adult_saturday: 'Adult Saturday',
        adult_sunday: 'Adult Sunday',
        child_2day: 'Child 2-Day',
        child_saturday: 'Child Saturday',
        child_sunday: 'Child Sunday'
      };
      
      let label = types[type] || type;
      if (type === 'attendee' && subtype) {
        label += ` - ${subtypes[subtype] || subtype}`;
      }
      return label;
    };

    const formatDay = (day) => {
      const days = {
        friday: 'Friday',
        saturday: 'Saturday',
        sunday: 'Sunday'
      };
      return days[day] || day;
    };

    const formatAllowedDays = (days) => {
      return days.map(d => formatDay(d)).join(', ');
    };

    const goBack = () => {
      stopCamera();
      router.push('/');
    };

    onMounted(() => {
      authStore.initAuth();
    });

    onUnmounted(() => {
      stopCamera();
    });

    return {
      videoElement,
      cameraActive,
      verificationResult,
      ticketData,
      error,
      resultClass,
      resultIcon,
      resultTitle,
      resultMessage,
      scanFlash,
      startCamera,
      stopCamera,
      resetScanner,
      clearError,
      formatTicketType,
      formatDay,
      formatAllowedDays,
      goBack,
      retryWithBasicConstraints,
    };
  },
};
</script>

<style scoped>
.scanner {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: 20px;
}

.btn-back {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.spacer {
  width: 70px;
}

.container {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.camera-prompt {
  text-align: center;
  padding: 40px 20px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.camera-prompt p {
  color: #666;
  margin-bottom: 30px;
  font-size: 16px;
}

.btn-camera {
  padding: 15px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: transform 0.2s;
}

.btn-camera:hover {
  transform: scale(1.05);
}

.btn-camera:active {
  transform: scale(0.98);
}

.camera-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  overflow-y: auto;
}

.camera-modal-content {
  width: 100%;
  max-width: 600px;
  text-align: center;
  padding-bottom: 20px;
}

.camera-view {
  text-align: center;
}

.camera-container {
  position: relative;
  background: black;
  border-radius: 15px;
  overflow: hidden;
  margin-bottom: 15px;
  border: 5px solid transparent;
  transition: border-color 0.3s ease;
}

.camera-container.scan-success {
  border-color: #4CAF50;
  animation: flashGreen 0.5s ease;
}

@keyframes flashGreen {
  0%, 100% {
    border-color: transparent;
    box-shadow: none;
  }
  50% {
    border-color: #4CAF50;
    box-shadow: 0 0 30px rgba(76, 175, 80, 0.8);
  }
}

video {
  width: 100%;
  height: auto;
  min-height: 300px;
  display: block;
  background: #000;
}

.scanner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scanner-box {
  width: 250px;
  height: 250px;
  border: 3px solid #4CAF50;
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
}

.camera-hint {
  color: #fff;
  margin-bottom: 15px;
  font-size: 14px;
}

.btn-stop {
  padding: 12px 30px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;
}

.btn-stop:hover {
  background: #d32f2f;
}

.result-card {
  background: white;
  border-radius: 15px;
  padding: 30px;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.result-card.success {
  border-top: 5px solid #4CAF50;
}

.result-card.warning {
  border-top: 5px solid #FF9800;
}

.result-card.error {
  border-top: 5px solid #f44336;
}

.result-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  margin: 0 auto 15px;
  color: white;
  font-weight: bold;
}

.result-card.success .result-icon {
  background: #4CAF50;
}

.result-card.warning .result-icon {
  background: #FF9800;
}

.result-card.error .result-icon {
  background: #f44336;
}

.result-card h2 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 20px;
}

.result-message {
  color: #666;
  margin: 10px 0 20px 0;
  font-size: 14px;
}

.ticket-details {
  text-align: left;
  margin: 30px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 10px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #e0e0e0;
}

.detail-row:last-child {
  border-bottom: none;
}

.label {
  font-weight: 600;
  color: #666;
}

.value {
  color: #333;
}

.badge {
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

.badge.day_pass {
  background: #e3f2fd;
  color: #1565c0;
}

.supplies-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 2px solid #e0e0e0;
}

.supplies-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.supplies-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.supplies-list li {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: white;
  border-radius: 5px;
  margin-bottom: 8px;
}

.supply-name {
  color: #333;
}

.supply-qty {
  font-weight: 600;
  color: #667eea;
}

.btn-reset {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.error-card {
  background: white;
  border-radius: 15px;
  padding: 30px;
  text-align: center;
  border-top: 5px solid #f44336;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.error-card p {
  color: #f44336;
  margin-bottom: 15px;
  font-size: 14px;
}

.btn-retry {
  padding: 12px 30px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}
</style>
