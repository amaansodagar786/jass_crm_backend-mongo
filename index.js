const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// MongoDB Connection
const connectDB = require('./config/mongodb');
connectDB();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Middlewares
app.use(cors());
app.use(express.json());


const cron = require("node-cron");

const Customer = require("./models/customer");

// API routes (same as before)
// const vendorRoutes = require('./routes/vendorRoutes'); 
// const itemRoutes = require('./routes/itemRoutes'); 
// const purchaseOrderRoutes = require("./routes/purchaseOrderRoutes"); 
// const grnRoutes = require("./routes/grnRoutes"); 

// const bomRoute = require("./routes/bomRoute"); 
// const salesRoutes = require("./routes/salesRoutes"); 

// const workOrderRoutes = require('./routes/workorderRoutes'); 
// const s3Routes = require('./routes/s3Routes'); 
const inventoryRoutes = require('./routes/inventoryRoutes');
// const DefectiveRoutes = require('./routes/defective'); 
const ProductsRoutes = require('./routes/products');
const InvoiceRoutes = require("./routes/invoiceRoutes");
const adminRoutes = require('./routes/admin');
const customerRoutes = require("./routes/customerRoutes");
const authRoutes = require("./routes/authRoutes");
const ReportRoutes = require("./routes/reports");
const promoCodesRoutes = require('./routes/promoCodes');




app.use('/customer', customerRoutes);
app.use('/auth', authRoutes);
app.use('/products', ProductsRoutes);
app.use("/invoices", InvoiceRoutes);
app.use('/admin', adminRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/report', ReportRoutes);

app.use('/promoCodes', promoCodesRoutes);


cron.schedule("0 0 1 1 *", async () => {
  try {
    await Customer.updateMany({}, { $set: { loyaltyCoins: 0 } });
    console.log("✅ Yearly reset: Loyalty coins reset for all customers (1 Jan)");
  } catch (error) {
    console.error("❌ Error resetting loyalty coins:", error);
  }
});






// Basic Route
app.get('/', (req, res) => {
  res.send('Hello World from Jass Inventory Backend !');
});

// Server
const PORT = process.env.PORT || 3037;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});