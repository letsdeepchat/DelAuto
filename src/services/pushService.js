const webpush = require('web-push');

// Configure web push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@delauto.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

class PushService {
  /**
   * Send push notification to a specific agent
   * @param {Object} agent - Agent object with push subscription
   * @param {Object} payload - Notification payload
   * @param {string} payload.title - Notification title
   * @param {string} payload.body - Notification body
   * @param {Object} payload.data - Additional data
   */
  async sendToAgent(agent, payload) {
    if (!agent.push_subscription) {
      console.log(`No push subscription found for agent ${agent._id}`);
      return;
    }

    try {
      await webpush.sendNotification(
        agent.push_subscription,
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          data: payload.data || {}
        })
      );
      console.log(`Push notification sent to agent ${agent._id}`);
    } catch (error) {
      console.error(`Error sending push notification to agent ${agent._id}:`, error);

      // If subscription is expired or invalid, remove it
      if (error.statusCode === 410 || error.statusCode === 400) {
        // TODO: Remove invalid subscription from agent record
        console.log(`Removing invalid push subscription for agent ${agent._id}`);
      }
    }
  }

  /**
   * Send new recording notification to agent
   * @param {Object} agent - Agent object
   * @param {Object} delivery - Delivery object
   * @param {string} recordingUrl - Recording URL
   */
  async sendNewRecordingNotification(agent, delivery, recordingUrl) {
    await this.sendToAgent(agent, {
      title: 'New Customer Recording',
      body: `New recording available for delivery at ${delivery.address}`,
      data: {
        type: 'new_recording',
        deliveryId: delivery._id,
        recordingUrl: recordingUrl,
        address: delivery.address
      }
    });
  }

  /**
   * Send delivery status update notification
   * @param {Object} agent - Agent object
   * @param {Object} delivery - Delivery object
   * @param {string} newStatus - New delivery status
   */
  async sendDeliveryStatusNotification(agent, delivery, newStatus) {
    await this.sendToAgent(agent, {
      title: 'Delivery Status Update',
      body: `Delivery at ${delivery.address} is now ${newStatus.replace('_', ' ')}`,
      data: {
        type: 'status_update',
        deliveryId: delivery._id,
        status: newStatus,
        address: delivery.address
      }
    });
  }

  /**
   * Send new delivery assignment notification
   * @param {Object} agent - Agent object
   * @param {Object} delivery - Delivery object
   */
  async sendNewDeliveryNotification(agent, delivery) {
    await this.sendToAgent(agent, {
      title: 'New Delivery Assigned',
      body: `New delivery assigned: ${delivery.address}`,
      data: {
        type: 'new_delivery',
        deliveryId: delivery._id,
        address: delivery.address,
        scheduledTime: delivery.scheduled_time
      }
    });
  }

  /**
   * Generate VAPID keys for push notifications
   * @returns {Object} - Public and private VAPID keys
   */
  generateVAPIDKeys() {
    return webpush.generateVAPIDKeys();
  }
}

module.exports = new PushService();