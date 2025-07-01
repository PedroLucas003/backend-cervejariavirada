const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Beer',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    image: String
  }],
  shippingAddress: {
    cep: { type: String, required: true },
    logradouro: { type: String, required: true },
    numero: { type: String, required: true },
    complemento: String,
    bairro: { type: String, required: true },
    cidade: { type: String, required: true },
    estado: { type: String, required: true, maxlength: 2 }
  },
  paymentInfo: {
    paymentId: { 
      type: String // Removido 'required: true' pois o ID real virá do MP
    },
    preferenceId: { type: String },
    paymentMethod: {
      type: String,
      enum: ['credit_card', 'debit_card', 'boleto', 'pix', 'other']
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'approved', 'authorized', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'],
      default: 'pending'
    },
    pixCode: String,
    qrCodeBase64: String,
    expirationDate: Date,
    paymentDetails: { type: Object },
    mercadoPagoFee: { type: Number },
    netReceivedAmount: { type: Number }
  },
  subtotal: {
    type: Number,
    required: true 
  },
  shippingCost: {
    type: Number,
    default: 0.01
  },
  total: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  trackingCode: String,
  trackingUrl: String,
  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  notes: String,
  internalNotes: String,
  metadata: Object
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

orderSchema.pre('save', function(next) {
  if (this.isModified('items') || this.isNew) {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    this.total = this.subtotal + this.shippingCost;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);