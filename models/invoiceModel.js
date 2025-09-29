const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  date: {
    type: String,
    required: true,
  },
  customer: {
    type: {
      customerId: String,
      customerNumber: String,
      name: String,
      email: String,
      mobile: String
    },
    required: true
  },
  items: [{
    productId: String,
    name: String,
    barcode: String,
    hsn: String,
    category: String,
    price: Number,
    taxSlab: Number,
    quantity: Number,
    discount: Number,
    batchNumber: String, // ← Add batch info
    expiryDate: Date,
    // Add these fields to store individual item calculations
    baseValue: Number,
    discountAmount: Number,
    taxAmount: Number,
    cgstAmount: Number,
    sgstAmount: Number,
    totalAmount: Number
  }],
  paymentType: {
    type: String,
    required: true,
    enum: ["cash", "card", "upi"]
  },
  subtotal: {
    type: Number,
    required: true
  },
  baseValue: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    required: true
  },
  cgst: {
    type: Number,
    required: true
  },
  sgst: {
    type: Number,
    required: true
  },
  // Add these fields to track tax details
  hasMixedTaxRates: {
    type: Boolean,
    required: true
  },
  taxPercentages: [Number],
  total: {
    type: Number,
    required: true
  },
  remarks: {
    type: String,
    default: "" // Add remarks field
  }
}, {
  timestamps: true
});

// Create index for invoiceNumber for better query performance
invoiceSchema.index({ invoiceNumber: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;