const dynamoose = require("dynamoose");
const crypto = require("crypto");

const defectiveSchema = new dynamoose.Schema({
  defectiveId: {
    type: String,
    hashKey: true,
    default: () => crypto.randomUUID(),
  },
  defectiveNumber: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["defectFinds", "restoreDefects"],
  },
  defectiveReferenceId: {
    type: String,
    required: function() {
      return this.type === "restoreDefects";
    }
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
        whenDefect: String,
        reason: String
      }
    }]
  }
}, {
  timestamps: true,
});

const Defective = dynamoose.model("Defectives", defectiveSchema);
module.exports = Defective;