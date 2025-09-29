const dynamoose = require("dynamoose");

const workOrderSchema = new dynamoose.Schema(
  {
    workOrderNumber: {
      type: String,
      hashKey: true,
      required: true,
    },
    workOrderDate: String,
    poNumber: String,
    poDate: String,
    receiver: {
      type: Object,
      schema: {
        customerId: String,
        companyName :String,
        name: String,
        gstin: String,
        address: String,
        city: String,
        pincode: String,
        contact: String,
        email: String,
      },
    },
    // consignee: {
    //   type: Object,
    //   schema: {
    //     name: String,
    //     gstin: String,
    //     address: String,
    //     contact: String,
    //     email: String,
    //   },
    // },
    items: {
      type: Array,
      schema: [
        {
          type: Object,
          schema: {
            bomId: String,
            name: String,
            description: String,
            hsn: String,
            quantity: Number,
            unitPrice: Number,
            units: String,
          },
        },
      ],
    },
    // lrNumber: String,
    // lrDate: String,
    // transporter: String,
    // transportMobile: String,
    // bank: {
    //   type: Object,
    //   schema: {
    //     name: String,
    //     account: String,
    //     branch: String,
    //     ifsc: String,
    //   },
    // },
    // otherCharges: Number, 
    subtotal: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    total: Number,
    status: String
  },
  {
    timestamps: true,
  }
);

const WorkOrder = dynamoose.model("WorkOrders", workOrderSchema);
module.exports = WorkOrder;