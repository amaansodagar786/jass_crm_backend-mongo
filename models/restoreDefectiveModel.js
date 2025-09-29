// models/restoreDefectiveModel.js
const dynamoose = require("dynamoose");
const crypto = require("crypto");

const restoreDefectiveSchema = new dynamoose.Schema({
  restoreId: {
    type: String,
    hashKey: true,
    default: () => crypto.randomUUID(),
  },
  restoreNumber: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  defectiveReferenceId: {
    type: String,
    required: true
  },
  defectiveReferenceNumber: {
    type: String,
    required: true
  },
  items: {
    type: Array,
    schema: [{
      type: Object,
      schema: {
        itemId: String,
        itemName: String,
        itemDescription: String,
        hsnCode: String,
        quantity: Number,
        originalDefectQuantity: Number // Store original for reference
      }
    }]
  },
  notes: {
    type: String
  }
}, {
  timestamps: true,
});

const RestoreDefective = dynamoose.model("RestoreDefectives", restoreDefectiveSchema);
module.exports = RestoreDefective;