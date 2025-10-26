# Database Models

This document provides detailed information about the Mongoose models used in the DelAuto system.

## Model Overview

All models extend the base Mongoose Schema with common patterns:
- Automatic timestamps (`createdAt`, `updatedAt`)
- Validation rules
- Indexing for performance
- Population references for relationships

## Agent Model

**File:** `src/database/models/Agent.js`

### Schema Definition
```javascript
const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['agent', 'admin'], default: 'agent' },
    active_deliveries: { type: Number, default: 0 },
    current_location: mongoose.Schema.Types.Mixed,
    is_active: { type: Boolean, default: true },
    push_subscription: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
```

### Methods
```javascript
// Instance methods
agentSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, email: this.email, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

agentSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Static methods
agentSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

agentSchema.statics.findActiveAgents = function() {
  return this.find({ is_active: true, role: 'agent' });
};
```

### Virtuals
```javascript
agentSchema.virtual('fullName').get(function() {
  return this.name;
});

agentSchema.virtual('isAdmin').get(function() {
  return this.role === 'admin';
});
```

### Pre/Post Hooks
```javascript
// Hash password before saving
agentSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Update last login timestamp
agentSchema.methods.updateLastLogin = function() {
  this.last_login = new Date();
  this.login_count += 1;
  return this.save();
};
```

## Customer Model

**File:** `src/database/models/Customer.js`

### Schema Definition
```javascript
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: String,
    preferences: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
```

### Methods
```javascript
customerSchema.methods.updatePreferences = function(newPreferences) {
  this.preferences = { ...this.preferences, ...newPreferences };
  return this.save();
};

customerSchema.methods.addCallToHistory = function(callData) {
  if (!this.call_history) this.call_history = [];
  this.call_history.push({
    call_id: callData.call_id,
    timestamp: new Date(),
    status: callData.status,
    duration: callData.duration,
  });

  // Keep only last 50 calls
  if (this.call_history.length > 50) {
    this.call_history = this.call_history.slice(-50);
  }

  return this.save();
};
```

### Virtuals
```javascript
customerSchema.virtual('totalCalls').get(function() {
  return this.call_history ? this.call_history.length : 0;
});

customerSchema.virtual('successfulCalls').get(function() {
  return this.call_history ?
    this.call_history.filter(call => call.status === 'completed').length : 0;
});

customerSchema.virtual('callSuccessRate').get(function() {
  const total = this.totalCalls;
  if (total === 0) return 0;
  return (this.successfulCalls / total) * 100;
});
```

## Delivery Model

**File:** `src/database/models/Delivery.js`

### Schema Definition
```javascript
const deliverySchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    address: { type: String, required: true },
    scheduled_time: { type: Date, required: true },
    status: { type: String, default: 'scheduled' },
  },
  { timestamps: true },
);
```

### Methods
```javascript
deliverySchema.methods.assignToAgent = function(agentId) {
  this.agent_id = agentId;
  this.status = 'assigned';
  this.tracking_events.push({
    status: 'assigned',
    timestamp: new Date(),
    notes: `Assigned to agent ${agentId}`,
  });
  return this.save();
};

deliverySchema.methods.updateStatus = function(newStatus, notes = '') {
  this.status = newStatus;
  this.tracking_events.push({
    status: newStatus,
    timestamp: new Date(),
    notes,
  });

  if (newStatus === 'completed') {
    this.actual_delivery_time = new Date();
  }

  return this.save();
};

deliverySchema.methods.addFeedback = function(rating, comments) {
  this.customer_feedback = { rating, comments };
  return this.save();
};
```

### Virtuals
```javascript
deliverySchema.virtual('isOverdue').get(function() {
  return this.status !== 'completed' &&
         this.status !== 'cancelled' &&
         new Date() > this.scheduled_time;
});

deliverySchema.virtual('deliveryDuration').get(function() {
  if (!this.actual_delivery_time || !this.createdAt) return null;
  return (this.actual_delivery_time - this.createdAt) / (1000 * 60); // minutes
});

deliverySchema.virtual('isHighPriority').get(function() {
  return this.priority === 'high' || this.priority === 'urgent';
});
```

### Static Methods
```javascript
deliverySchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('customer_id').populate('agent_id');
};

deliverySchema.statics.findOverdue = function() {
  return this.find({
    status: { $nin: ['completed', 'cancelled'] },
    scheduled_time: { $lt: new Date() },
  });
};

deliverySchema.statics.getDeliveryStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
};
```

## CallLog Model

**File:** `src/database/models/CallLog.js`

### Schema Definition
```javascript
const callLogSchema = new mongoose.Schema(
  {
    delivery_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
    },
    call_sid: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    from_number: { type: String, required: true },
    to_number: { type: String, required: true },
    start_time: { type: Date },
    end_time: { type: Date },
    duration: { type: Number },
    recording_url: { type: String },
  },
  { timestamps: true },
);
```

### Methods
```javascript
callLogSchema.methods.updateStatus = function(newStatus, additionalData = {}) {
  this.status = newStatus;

  if (newStatus === 'in-progress' && !this.start_time) {
    this.start_time = new Date();
  } else if (['completed', 'failed', 'busy', 'no-answer'].includes(newStatus)) {
    this.end_time = new Date();
    if (this.start_time) {
      this.duration = Math.round((this.end_time - this.start_time) / 1000);
    }
  }

  // Add webhook event
  this.webhook_events.push({
    event: newStatus,
    timestamp: new Date(),
    data: additionalData,
  });

  return this.save();
};

callLogSchema.methods.setRecording = function(recordingUrl, duration) {
  this.recording_url = recordingUrl;
  this.recording_duration = duration;
  return this.save();
};
```

### Virtuals
```javascript
callLogSchema.virtual('isSuccessful').get(function() {
  return ['completed'].includes(this.status);
});

callLogSchema.virtual('isFailed').get(function() {
  return ['failed', 'no-answer', 'busy'].includes(this.status);
});

callLogSchema.virtual('cost').get(function() {
  // Calculate cost based on duration and Twilio pricing
  if (!this.duration) return 0;
  const baseCost = 0.014; // $0.014 per minute
  return (this.duration / 60) * baseCost;
});
```

## Recording Model

**File:** `src/database/models/Recording.js`

### Schema Definition
```javascript
const recordingSchema = new mongoose.Schema(
  {
    call_log_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true,
    },
    delivery_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
    },
    audio_url: { type: String, required: true },
    duration: { type: Number, required: true },
    transcription: mongoose.Schema.Types.Mixed,
    processing_status: { type: String, default: 'pending' },
  },
  { timestamps: true },
);
```

### Methods
```javascript
recordingSchema.methods.setTranscription = function(transcriptionData) {
  this.transcription = {
    text: transcriptionData.text,
    confidence: transcriptionData.confidence,
    language: transcriptionData.language || 'en',
    processing_time: transcriptionData.processing_time,
  };
  this.processing_status = 'completed';
  this.last_processed_at = new Date();
  return this.save();
};

recordingSchema.methods.setAIAnalysis = function(aiData) {
  this.ai_analysis = {
    sentiment: aiData.sentiment,
    keywords: aiData.keywords,
    instructions: aiData.instructions,
    priority: aiData.priority,
    entities: aiData.entities,
    summary: aiData.summary,
  };
  return this.save();
};

recordingSchema.methods.markAsAccessed = function() {
  this.access_count += 1;
  this.last_accessed_at = new Date();
  return this.save();
};
```

### Virtuals
```javascript
recordingSchema.virtual('hasTranscription').get(function() {
  return this.transcription && this.transcription.text;
});

recordingSchema.virtual('hasAIAnalysis').get(function() {
  return this.ai_analysis && Object.keys(this.ai_analysis).length > 0;
});

recordingSchema.virtual('isProcessed').get(function() {
  return this.processing_status === 'completed';
});
```

## Model Relationships

### Population Patterns
```javascript
// Populate delivery with customer and agent
const delivery = await Delivery.findById(id)
  .populate('customer_id', 'name phone email')
  .populate('agent_id', 'name phone email');

// Populate call log with delivery and recording
const callLog = await CallLog.findById(id)
  .populate({
    path: 'delivery_id',
    populate: {
      path: 'customer_id agent_id',
      select: 'name phone email'
    }
  })
  .populate('recording_id');
```

### Virtual Population (Reverse References)
```javascript
// Add virtual for customer's deliveries
customerSchema.virtual('deliveries', {
  ref: 'Delivery',
  localField: '_id',
  foreignField: 'customer_id',
});

// Add virtual for agent's deliveries
agentSchema.virtual('deliveries', {
  ref: 'Delivery',
  localField: '_id',
  foreignField: 'agent_id',
});

// Add virtual for delivery's call logs
deliverySchema.virtual('call_logs', {
  ref: 'CallLog',
  localField: '_id',
  foreignField: 'delivery_id',
});
```

## Model Validation

### Custom Validators
```javascript
// Phone number validation
function validatePhoneNumber(phone) {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

// Email validation
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Date validation
function validateFutureDate(date) {
  return date > new Date();
}
```

### Schema-Level Validation
```javascript
agentSchema.path('email').validate(function(email) {
  return validateEmail(email);
}, 'Invalid email format');

deliverySchema.path('scheduled_time').validate(function(date) {
  return validateFutureDate(date);
}, 'Scheduled time must be in the future');
```

## Model Plugins

### Common Plugins Used
```javascript
const mongoosePaginate = require('mongoose-paginate-v2');
const mongooseAggregatePaginate = require('mongoose-aggregate-paginate-v2');

// Add pagination plugin
deliverySchema.plugin(mongoosePaginate);
callLogSchema.plugin(mongooseAggregatePaginate);
```

## Model Middleware

### Pre-Save Middleware
```javascript
// Update customer delivery count
deliverySchema.pre('save', async function(next) {
  if (this.isNew && this.customer_id) {
    await mongoose.model('Customer').findByIdAndUpdate(
      this.customer_id,
      { $inc: { total_deliveries: 1 } }
    );
  }
  next();
});

// Update agent active deliveries count
deliverySchema.pre('save', async function(next) {
  if (this.isModified('agent_id') && this.agent_id) {
    // Decrement old agent count
    if (this.original && this.original.agent_id) {
      await mongoose.model('Agent').findByIdAndUpdate(
        this.original.agent_id,
        { $inc: { active_deliveries: -1 } }
      );
    }

    // Increment new agent count
    await mongoose.model('Agent').findByIdAndUpdate(
      this.agent_id,
      { $inc: { active_deliveries: 1 } }
    );
  }
  next();
});
```

### Post-Save Middleware
```javascript
// Log delivery status changes
deliverySchema.post('save', function(doc) {
  if (doc.isModified('status')) {
    logger.info(`Delivery ${doc._id} status changed to ${doc.status}`);
  }
});
```

## Model Testing

### Unit Tests
```javascript
describe('Agent Model', () => {
  test('should hash password on save', async () => {
    const agent = new Agent({
      name: 'Test Agent',
      email: 'test@example.com',
      password: 'password123',
      phone: '+1234567890'
    });

    await agent.save();
    expect(agent.password).not.toBe('password123');
    expect(await agent.comparePassword('password123')).toBe(true);
  });

  test('should generate auth token', async () => {
    const agent = new Agent({
      name: 'Test Agent',
      email: 'test@example.com',
      password: 'password123',
      phone: '+1234567890'
    });

    const token = agent.generateAuthToken();
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(agent._id.toString());
  });
});
```

### Integration Tests
```javascript
describe('Delivery Model Relationships', () => {
  test('should populate customer and agent', async () => {
    const customer = await Customer.create({
      name: 'John Doe',
      phone: '+1234567890'
    });

    const agent = await Agent.create({
      name: 'Agent Smith',
      email: 'agent@example.com',
      password: 'password123',
      phone: '+1234567891'
    });

    const delivery = await Delivery.create({
      customer_id: customer._id,
      agent_id: agent._id,
      address: '123 Main St',
      scheduled_time: new Date(Date.now() + 3600000)
    });

    const populatedDelivery = await Delivery.findById(delivery._id)
      .populate('customer_id')
      .populate('agent_id');

    expect(populatedDelivery.customer_id.name).toBe('John Doe');
    expect(populatedDelivery.agent_id.name).toBe('Agent Smith');
  });
});
```

## Performance Considerations

### Indexing Strategy
- **Single field indexes** for frequently queried fields
- **Compound indexes** for multi-field queries
- **Sparse indexes** for optional fields
- **Text indexes** for search functionality

### Query Optimization
```javascript
// Use lean() for read-only operations
const deliveries = await Delivery.find().lean();

// Use select() to limit fields
const agents = await Agent.find().select('name email phone');

// Use cursor for large result sets
const cursor = Delivery.find().cursor();
for await (const delivery of cursor) {
  // Process delivery
}
```

### Connection Pooling
```javascript
// Configure connection pool
mongoose.connect(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

This comprehensive model structure provides a solid foundation for the DelAuto application, ensuring data integrity, performance, and maintainability.