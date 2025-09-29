// models/purchaseOrderModel.js
const dynamoose = require("dynamoose");

const itemSchema = new dynamoose.Schema({
  itemId: String,
  name: String,
  description: String,
  hsn: String,
  qty: Number,
  rate: Number,
  unit: String
}, { saveUnknown: true });

const purchaseOrderSchema = new dynamoose.Schema({
  poNumber: {
    type: String,
    hashKey: true
  },
  date: String,
  ownerGST: String,
  ownerPAN: String,
  companyName: String,
  vendorId: String,
  vendorName: String,
  vendorGST: String,
  vendorAddress: String,
  vendorContact: String,
  vendorEmail: String,
  shipName: String,
  shipCompany: String,
  shipPhone: String,
  consigneeAddress: String,
  deliveryAddress: String,
  extraNote: String, // ADD THIS FIELD
  terms: String,
  gstType: String,
  items: {
    type: Array,
    schema: [itemSchema]
  },
  taxSlab: { // ADDED: Tax slab field
    type: Number,
    default: 18
  },
  discount: {
    type: Number,
    default: 0
  },
  discountAmount: Number,
  discountedSubtotal: Number,
  subtotal: Number,
  cgst: Number,
  sgst: Number,
  igst: Number,
  total: Number,
  pdfUrl: String,
}, {
  timestamps: true
});

const PurchaseOrder = dynamoose.model("PurchaseOrder", purchaseOrderSchema);
module.exports = PurchaseOrder;