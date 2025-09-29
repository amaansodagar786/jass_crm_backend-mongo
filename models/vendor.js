// models/vendor.js (Dynamoose Version)

const dynamoose = require('dynamoose');

const vendorSchema = new dynamoose.Schema({
  vendorId: {
    type: String,
    hashKey: true,
    default: () => require('uuid').v4(),
  },
  vendorName: String,
  companyName: String,
  gstNumber: String,
  email: {
    type: String,
    // index: {
    //   name: 'emailIndex',
    //   global: true,
    //   project: true
    // }
  },
  email2: String,
  email3: String,
  contactNumber: String,
  contactNumber2: String,
  contactNumber3: String,
  address: String,
}, {
  timestamps: true,
});

const Vendor = dynamoose.model('Vendors', vendorSchema);

module.exports = Vendor;
