// models/bomModel.js
const dynamoose = require("dynamoose");

const bomSchema = new dynamoose.Schema(
  {
    bomId: {
      type: String,
      hashKey: true,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    description: String,
    hsnCode: String,
    items: {
      type: Array,
      schema: [
        {
          type: Object,
          schema: {
            itemId: String,
            itemName: String,
            itemDescription: String,
            requiredQty: Number,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

const BOM = dynamoose.model("BOMs", bomSchema);
module.exports = BOM;