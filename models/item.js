const dynamoose = require("dynamoose");
const crypto = require("crypto"); // for generating UUID

const itemSchema = new dynamoose.Schema({
  itemId: {
    type: String,
    hashKey: true,
    default: () => crypto.randomUUID(),
  },
  itemName: {
    type: String,
    required: true,
  },
  minimumQty: {
    type: Number,
    required: true,
  },
  hsnCode: {
    type: String,
    // index: {
    //   name: 'hsnCodeIndex',
    //   global: true,
    //   project: true
    // }
  },
  unit: {
    type: String,
  },
  description: {
    type: String,
  },
  taxSlab: {
    type: Number,
    required: true,
  },
}, {
  timestamps: true,
});

const Item = dynamoose.model("items", itemSchema);
module.exports = Item;
