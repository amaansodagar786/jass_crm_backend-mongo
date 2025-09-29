const dynamoose = require("dynamoose");

const grnSchema = new dynamoose.Schema({
  grnNumber: {
    type: String,
    hashKey: true,
    required: true
  },
  grnDate: String,
  poNumber: String,
  poDate: String,
  lrNumber: String,
  transporter: String,
  vehicleNo: String,
  companyName: String,
  vendorName: String,
  vendorGST: String,
  vendorAddress: String,
  vendorContact: String,
  vendorEmail: String,
  vendorId: String,
  items: {
    type: Array,
    schema: [
      {
        type: Object,
        schema: {
          itemId: String,
          name: String,
          description: String,
          hsn: String,
          qty: Number,
          rate: Number,
          unit: String
        }
      }
    ]
  },
  comments: String,
  otherCharges: Number,
  subtotal: Number,
  cgst: Number,
  sgst: Number,
  igst: Number,
  total: Number,
  gstType: String
}, {
  timestamps: true
});

const GRN = dynamoose.model("GRNs", grnSchema);
module.exports = GRN;
