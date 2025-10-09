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



app.use('/customer', customerRoutes);
app.use('/auth', authRoutes);
app.use('/products', ProductsRoutes);
app.use("/invoices", InvoiceRoutes);
app.use('/admin', adminRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/report', ReportRoutes);

// app.use('/vendors', vendorRoutes);
// app.use('/items', itemRoutes);
// app.use('/po', purchaseOrderRoutes);
// app.use('/grn', grnRoutes);
// app.use('/bom', bomRoute);
// app.use('/sales', salesRoutes);

// app.use('/workorder', workOrderRoutes);
// app.use('/s3', s3Routes);

// app.use('/defective', DefectiveRoutes);


// Basic Route
app.get('/', (req, res) => {
  res.send('Hello World from Jass Perfumes Inventory Backend !');
});

// Server
const PORT = process.env.PORT || 3037;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});